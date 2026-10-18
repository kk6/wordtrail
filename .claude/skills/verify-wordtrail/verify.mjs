#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import puppeteer from "puppeteer-core";
import { importNotebook } from "../../../extension/backup.js";
import { parseMeanings } from "../../../extension/meanings-text.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
const extensionDir = path.join(root, "extension");
const chromePath =
	process.env.CHROME_PATH ??
	"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const fixtures = {
	"/": readFileSync(path.join(here, "fixtures/article.html")),
	"/frame": readFileSync(path.join(here, "fixtures/frame.html")),
	"/other": readFileSync(path.join(here, "fixtures/other.html")),
};

function expectedExtensionId() {
	const manifest = JSON.parse(
		readFileSync(path.join(extensionDir, "manifest.json"), "utf8"),
	);
	const hex = createHash("sha256")
		.update(Buffer.from(manifest.key, "base64"))
		.digest("hex")
		.slice(0, 32);
	return [...hex]
		.map((c) => String.fromCharCode(97 + Number.parseInt(c, 16)))
		.join("");
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function startSession(evidenceDir) {
	const server = http
		.createServer((req, res) => {
			res.setHeader("content-type", "text/html; charset=utf-8");
			res.end(fixtures[req.url] ?? fixtures["/"]);
		})
		.listen(0, "127.0.0.1");
	await new Promise((resolve) => server.once("listening", resolve));
	const url = `http://127.0.0.1:${server.address().port}/`;
	const profile = mkdtempSync(path.join(tmpdir(), "wordtrail-verify-"));
	let browser;
	let page;
	// Same profile every time, so a relaunch is a Chrome restart for the notebook.
	async function launch() {
		browser = await puppeteer.launch({
			executablePath: chromePath,
			headless: false,
			pipe: true,
			defaultViewport: null,
			enableExtensions: [extensionDir],
			userDataDir: profile,
		});
		page = await browser.newPage();
		await page.goto(url);
	}
	await launch();
	// Only a fresh install starts the worker right away; after a reload or a
	// restart it waits for an event, so take the ID once here.
	const worker = await browser.waitForTarget(
		(t) => t.type() === "service_worker",
	);
	const extensionId = new URL(worker.url()).host;

	const panelTarget = () =>
		browser.targets().find((t) => t.url().endsWith("/panel.html"));

	return {
		url,
		extensionId,
		// Same as removing the extension on chrome://extensions and loading the
		// folder again; removing it deletes chrome.storage with it.
		async reinstallExtension() {
			await browser.uninstallExtension(extensionId);
			const id = await browser.installExtension(extensionDir);
			if (id !== extensionId) throw new Error(`ID が変わった: ${id}`);
			await wait(500);
			await page.reload();
		},
		// Downloads land in dir under the name the page suggests.
		async downloadTo(dir) {
			const cdp = await browser.target().createCDPSession();
			await cdp.send("Browser.setDownloadBehavior", {
				behavior: "allow",
				downloadPath: dir,
			});
		},
		// Clicks a button that opens the file picker and picks file in it.
		async chooseFileInPanel(selector, file, { dialog } = {}) {
			const panel = await panelTarget().asPage();
			await panel.bringToFront();
			if (dialog !== undefined)
				panel.once("dialog", (d) => (dialog ? d.accept() : d.dismiss()));
			const [chooser] = await Promise.all([
				panel.waitForFileChooser(),
				panel.click(selector),
			]);
			await chooser.accept([file]);
			await wait(500);
			await page.bringToFront();
		},
		async restartChrome() {
			await browser.close();
			await launch();
		},
		// Stands in for the reload button on chrome://extensions, which lives in
		// shadow DOM: loading the same folder again reloads it from disk.
		// chrome.runtime.reload() leaves a CDP-loaded extension stuck unloaded.
		// Reloading orphans the page's content script, so the reader reloads
		// the page as after a real reload.
		async reloadExtension() {
			const id = await browser.installExtension(extensionDir);
			if (id !== extensionId) throw new Error(`ID が変わった: ${id}`);
			await wait(500);
			await page.reload();
		},
		// frame: a path such as "/frame" to click inside that iframe.
		async dblclick(selector, frame) {
			const scope = frame
				? page.frames().find((f) => new URL(f.url()).pathname === frame)
				: page;
			// boundingBox() is relative to the main viewport, even inside a frame.
			const box = await (await scope.$(selector)).boundingBox();
			await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, {
				count: 2,
			});
			await wait(1200);
		},
		panelOpen: () => Boolean(panelTarget()),
		// Moves the reading tab to another fixture page, e.g. "/other".
		async goto(pathname) {
			await page.goto(new URL(pathname, url).href);
		},
		async panelContexts() {
			const panel = await panelTarget().asPage();
			return panel.$$eval("#contexts li", (items) => items.length);
		},
		// The real entry is the toolbar icon, which puppeteer can't click, and a
		// CDP userGesture doesn't count as a gesture for sidePanel.open(). So the
		// panel page is opened in a tab instead.
		async openPanel() {
			const panel = await browser.newPage();
			await panel.goto(`chrome-extension://${extensionId}/panel.html`);
			await page.bringToFront();
			await wait(300);
		},
		async panelText(id) {
			const panel = await panelTarget().asPage();
			// Inputs hold their text in value; other elements in textContent.
			return panel.$eval(`#${id}`, (e) => e.value ?? e.textContent);
		},
		async panelPlaceholder(id) {
			const panel = await panelTarget().asPage();
			return panel.$eval(`#${id}`, (e) => e.placeholder);
		},
		// Replaces a field's text by typing, as the reader would.
		async typeInPanel(id, text) {
			const panel = await panelTarget().asPage();
			await panel.bringToFront();
			await panel.$eval(`#${id}`, (e) => e.select());
			await panel.keyboard.type(text);
			await page.bringToFront();
		},
		// dialog: true or false accepts or dismisses the confirm() it opens.
		async clickInPanel(selector, { dialog } = {}) {
			const panel = await panelTarget().asPage();
			await panel.bringToFront();
			if (dialog !== undefined)
				panel.once("dialog", (d) => (dialog ? d.accept() : d.dismiss()));
			await panel.click(selector);
			await wait(300);
			await page.bringToFront();
		},
		async listHeadwords() {
			const panel = await panelTarget().asPage();
			return panel.$$eval("#words > li", (items) =>
				items.map((item) => item.dataset.headword),
			);
		},
		// What the reader sees in an opened word of the list.
		async listDetail(headword) {
			const panel = await panelTarget().asPage();
			return panel.$eval(
				`#words li[data-headword="${headword}"] details`,
				(d) => ({
					open: d.open,
					meanings: d.querySelector(".meanings").innerText,
					contexts: [...d.querySelectorAll("ol li")].map((li) => li.innerText),
				}),
			);
		},
		// Read-only look at what was saved, for values the panel doesn't show as-is.
		async savedWords() {
			const panel = await panelTarget().asPage();
			return panel.evaluate(
				async () => (await chrome.storage.local.get("words")).words ?? {},
			);
		},
		// Waits for the real dictionary, which the panel gives up on after 10s.
		async panelMeanings() {
			const panel = await panelTarget().asPage();
			await panel.waitForFunction(
				() =>
					document.getElementById("meanings").placeholder !==
					"辞書を引いています…",
				// The panel tab sits behind the page, where rAF-based polling never fires.
				{ polling: 200, timeout: 12000 },
			);
			return parseMeanings(await panel.$eval("#meanings", (e) => e.value));
		},
		async screenshot(name) {
			await page.screenshot({
				path: path.join(evidenceDir, `${name}-page.png`),
			});
			const target = panelTarget();
			if (target) {
				const panel = await target.asPage();
				await panel.screenshot({
					path: path.join(evidenceDir, `${name}-panel.png`),
				});
			}
		},
		async close() {
			await browser.close();
			server.close();
			rmSync(profile, { recursive: true, force: true });
		},
	};
}

// Each journey drives the real user path and records checks; see features/.
const journeys = {
	async "select-word"(s, check) {
		await s.dblclick("#ubiquitous");
		check("閉じた状態のダブルクリックではパネルが開かない", !s.panelOpen());
		await s.dblclick("#ja");
		await s.openPanel();
		check(
			"パネルを開くと、日本語の語は飛ばして最後の英単語が出る",
			(await s.panelText("word")) === "ubiquitous",
		);
		await s.dblclick("#idempotent");
		check(
			"開いた状態で別の単語に切り替わる",
			(await s.panelText("word")) === "idempotent",
		);
		await s.screenshot("select-word");
	},
	async sentence(s, check) {
		await s.openPanel();
		await s.dblclick("#idempotent");
		check(
			"単語を含む 1 文が出る",
			(await s.panelText("sentence")) ===
				"単語 The API is ubiquitous and idempotent.",
		);
		check("ページの URL が出る", (await s.panelText("url")) === s.url);
		await s.dblclick("#deprecated");
		check(
			"入れ子のインライン要素の語でも、改行と U.S. をまたいで 1 文が出る",
			(await s.panelText("sentence")) ===
				"The U.S. team has deprecated the old API.",
		);
		await s.screenshot("sentence");
	},
	async meanings(s, check) {
		await s.openPanel();
		await s.dblclick("#running");
		check("見出し語が小文字で出る", (await s.panelText("word")) === "running");
		const meanings = await s.panelMeanings();
		check(
			"辞書の意味が品詞ごとに出る",
			meanings[0]?.partOfSpeech === "verb" &&
				meanings[0].definitions[0] === "present participle and gerund of run",
		);
		check(
			"品詞ごとの意味は 2 個まで",
			meanings.length > 0 && meanings.every((m) => m.definitions.length <= 2),
		);
		check(
			"文と URL も出る",
			(await s.panelText("sentence")) === "Running is good exercise." &&
				(await s.panelText("url")) === s.url,
		);
		await s.dblclick("#qwzxvbn");
		check(
			"辞書にない語では、手での入力を案内する",
			(await s.panelMeanings()).length === 0 &&
				(await s.panelPlaceholder("meanings")).startsWith(
					"辞書から意味を取れません",
				),
		);
		await s.screenshot("meanings");
	},
	async save(s, check) {
		await s.openPanel();
		await s.dblclick("#running");
		await s.panelMeanings();
		await s.typeInPanel("word", "run");
		await s.typeInPanel("meanings", "verb:\n走る\n\nnoun:\n走ること");
		await s.clickInPanel("#save");
		check("保存したと出る", (await s.panelText("status")) === "保存しました。");
		const { run } = await s.savedWords();
		check("書き換えた見出し語で保存される", run?.headword === "run");
		check(
			"書き換えた意味で保存される",
			// chrome.storage hands objects back with their keys reordered.
			isDeepStrictEqual(run?.meanings, [
				{ partOfSpeech: "verb", definitions: ["走る"] },
				{ partOfSpeech: "noun", definitions: ["走ること"] },
			]),
			run?.meanings,
		);
		check(
			"文脈は文と URL の 1 件",
			run?.contexts.length === 1 &&
				run.contexts[0].sentence === "Running is good exercise." &&
				run.contexts[0].url === s.url,
		);
		await s.screenshot("save");
	},
	async registered(s, check) {
		await s.openPanel();
		await s.dblclick("#ubiquitous");
		await s.panelMeanings();
		await s.typeInPanel("meanings", "adjective:\nどこにでもある");
		await s.clickInPanel("#save");
		await s.goto("/other");
		await s.dblclick("#again");
		check(
			"別のページでは、登録済みと出る",
			(await s.panelText("status")) === "登録済みの単語です。",
		);
		check(
			"辞書を引き直さず、保存した意味が出る",
			(await s.panelText("meanings")) === "adjective:\nどこにでもある",
			await s.panelText("meanings"),
		);
		check(
			"保存しなくても、文脈が 2 件になる",
			(await s.panelContexts()) === 2 &&
				(await s.savedWords()).ubiquitous?.contexts.length === 2,
			await s.panelContexts(),
		);
		await s.dblclick("#again");
		check(
			"同じ文でもう一度ダブルクリックしても、3 件にならない",
			(await s.panelContexts()) === 2 &&
				(await s.savedWords()).ubiquitous?.contexts.length === 2,
			await s.panelContexts(),
		);
		await s.screenshot("registered");
	},
	async persist(s, check) {
		await s.openPanel();
		await s.dblclick("#ubiquitous");
		await s.panelMeanings();
		await s.typeInPanel("meanings", "adjective:\nどこにでもある");
		await s.clickInPanel("#save");
		const stillThere = async (label) => {
			await s.openPanel();
			await s.dblclick("#ubiquitous");
			check(
				`${label}も、登録済みと出て、保存した意味が出る`,
				(await s.panelText("status")) === "登録済みの単語です。" &&
					(await s.panelText("meanings")) === "adjective:\nどこにでもある",
				[await s.panelText("status"), await s.panelText("meanings")],
			);
		};
		await s.reloadExtension();
		// A real reload closes the extension's pages; this guards against a no-op.
		check("再読み込みで、開いていたパネルが閉じる", !s.panelOpen());
		await stillThere("拡張を再読み込みした後");
		await s.restartChrome();
		await stillThere("Chrome を再起動した後");
		await s.screenshot("persist");
	},
	async list(s, check) {
		await s.openPanel();
		for (const id of ["#ubiquitous", "#idempotent", "#deprecated"]) {
			await s.dblclick(id);
			await s.panelMeanings();
			await s.clickInPanel("#save");
		}
		await s.clickInPanel("#toggle-list");
		check(
			"一覧は新しい順に並ぶ",
			isDeepStrictEqual(await s.listHeadwords(), [
				"deprecated",
				"idempotent",
				"ubiquitous",
			]),
			await s.listHeadwords(),
		);
		await s.clickInPanel('#words li[data-headword="idempotent"] summary');
		const detail = await s.listDetail("idempotent");
		check(
			"単語をクリックすると、意味とこれまでの文脈が出る",
			detail.open &&
				detail.meanings.length > 0 &&
				detail.contexts.length === 1 &&
				detail.contexts[0].startsWith(
					"単語 The API is ubiquitous and idempotent.",
				),
			detail,
		);
		const remove = '#words li[data-headword="ubiquitous"] .delete';
		await s.clickInPanel('#words li[data-headword="ubiquitous"] summary');
		await s.clickInPanel(remove, { dialog: false });
		check(
			"削除の確認でキャンセルすると、消えない",
			(await s.listHeadwords()).length === 3,
		);
		await s.clickInPanel(remove, { dialog: true });
		check(
			"削除の確認で承認すると、その単語だけが消える",
			isDeepStrictEqual(await s.listHeadwords(), [
				"deprecated",
				"idempotent",
			]) && !("ubiquitous" in (await s.savedWords())),
			await s.listHeadwords(),
		);
		await s.screenshot("list");
	},
	async backup(s, check, evidenceDir) {
		await s.openPanel();
		await s.dblclick("#ubiquitous");
		await s.panelMeanings();
		await s.clickInPanel("#save");
		await s.dblclick("#idempotent");
		await s.panelMeanings();
		await s.clickInPanel("#save");
		await s.goto("/other");
		await s.dblclick("#again");
		const before = await s.savedWords();
		check(
			"準備: 2 語と、文脈 2 件の語がある",
			Object.keys(before).length === 2 &&
				before.ubiquitous?.contexts.length === 2,
			before,
		);

		const downloads = path.join(evidenceDir, "downloads");
		mkdirSync(downloads, { recursive: true });
		await s.downloadTo(downloads);
		await s.clickInPanel("#toggle-list");
		await s.clickInPanel("#export");
		await wait(1000);
		const [exported] = readdirSync(downloads).filter((f) =>
			/^wordtrail-\d{4}-\d{2}-\d{2}\.json$/.test(f),
		);
		const file = exported && path.join(downloads, exported);
		check(
			"書き出しで、全データが 1 つの JSON ファイルとしてダウンロードされる",
			Boolean(file) &&
				isDeepStrictEqual(
					importNotebook(readFileSync(file, "utf8")).words,
					before,
				),
			readdirSync(downloads),
		);

		const broken = path.join(evidenceDir, "broken.json");
		writeFileSync(broken, JSON.stringify({ words: "not a list" }));
		await s.chooseFileInPanel("#import", broken);
		check(
			"形の違うファイルは拒否され、単語帳は変わらない",
			(await s.panelText("list-status")).startsWith("読み込めませんでした") &&
				isDeepStrictEqual(await s.savedWords(), before),
			await s.panelText("list-status"),
		);

		await s.reinstallExtension();
		await s.openPanel();
		check(
			"拡張を削除して入れ直すと、単語帳は空になる",
			Object.keys(await s.savedWords()).length === 0,
		);
		await s.clickInPanel("#toggle-list");
		await s.chooseFileInPanel("#import", file, { dialog: false });
		check(
			"読み込みの確認でキャンセルすると、置き換わらない",
			Object.keys(await s.savedWords()).length === 0,
		);
		await s.chooseFileInPanel("#import", file, { dialog: true });
		check(
			"読み込みの確認で承認すると、全単語と全文脈が元に戻る",
			isDeepStrictEqual(await s.savedWords(), before),
			await s.savedWords(),
		);
		check(
			"読み込んだ単語が一覧に出る",
			(await s.listHeadwords()).length === 2,
			await s.listHeadwords(),
		);
		await s.screenshot("backup");
	},
	async iframe(s, check) {
		await s.openPanel();
		await s.dblclick("#framed", "/frame");
		check(
			"iframe の中の語がパネルに出る",
			(await s.panelText("word")) === "serendipity",
		);
		check(
			"文は iframe の中から取る",
			(await s.panelText("sentence")) ===
				"Inside the frame, serendipity happens.",
		);
		check(
			"URL は iframe ではなくタブのページのもの",
			(await s.panelText("url")) === s.url,
		);
		await s.screenshot("iframe");
	},
	async "stable-id"(s, check, evidenceDir) {
		check(
			"ID は manifest の key から決まる値",
			s.extensionId === expectedExtensionId(),
		);
		const other = await startSession(evidenceDir);
		check(
			"別のプロファイルで読み込んでも同じ ID",
			other.extensionId === s.extensionId,
		);
		await other.close();
	},
};

async function doctor() {
	const problems = [];
	if (!existsSync(chromePath)) problems.push(`Chrome がない: ${chromePath}`);
	if (!existsSync(path.join(extensionDir, "manifest.json")))
		problems.push(`manifest.json がない: ${extensionDir}`);
	else console.log(`extension ID (key から計算): ${expectedExtensionId()}`);
	if (!problems.length) {
		const browser = await puppeteer.launch({
			executablePath: chromePath,
			headless: true,
		});
		console.log(`Chrome: ${await browser.version()}`);
		await browser.close();
	}
	for (const p of problems) console.log(`NG ${p}`);
	console.log(problems.length ? "doctor: NG" : "doctor: OK");
	return problems.length === 0;
}

async function run(names) {
	const selected = names.includes("all") ? Object.keys(journeys) : names;
	const unknown = selected.filter((n) => !journeys[n]);
	if (!selected.length || unknown.length) {
		console.log(`ジャーニーの名前: ${Object.keys(journeys).join(", ")}, all`);
		return false;
	}
	const runId = new Date().toISOString().replace(/[:.]/g, "-");
	let ok = true;
	for (const name of selected) {
		const evidenceDir = path.join(root, "artifacts/verify", runId, name);
		mkdirSync(evidenceDir, { recursive: true });
		const checks = [];
		// actual: what was seen, recorded so a FAIL says why.
		const check = (label, passed, actual) =>
			checks.push({ label, passed, actual });
		const session = await startSession(evidenceDir);
		try {
			await journeys[name](session, check, evidenceDir);
		} catch (error) {
			checks.push({ label: `例外: ${error.message}`, passed: false });
			await session.screenshot(`${name}-error`).catch(() => {});
		} finally {
			await session.close();
		}
		writeFileSync(
			path.join(evidenceDir, "result.json"),
			JSON.stringify({ journey: name, checks }, null, "\t"),
		);
		for (const c of checks) {
			console.log(
				`${c.passed ? "PASS" : "FAIL"} [${name}] ${c.label}`,
				...(c.passed || c.actual === undefined
					? []
					: [JSON.stringify(c.actual)]),
			);
			ok &&= c.passed;
		}
	}
	console.log(`evidence: ${path.join(root, "artifacts/verify", runId)}`);
	return ok;
}

const [command, ...rest] = process.argv.slice(2);
const commands = { doctor: () => doctor(), run: () => run(rest) };
if (!commands[command]) {
	console.log("使い方: verify.mjs doctor | verify.mjs run <journey...|all>");
	process.exit(1);
}
process.exit((await commands[command]()) ? 0 : 1);
