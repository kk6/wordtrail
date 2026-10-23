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
import { formatMeanings } from "../../../extension/meanings-text.js";

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
// Hand-written in Eijiro's format; the real data must never be committed.
const eijiroSample = path.join(root, "test/fixtures/eijiro-sample.txt");

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
		// Setup only, for data in a shape the panel can no longer produce. Call it
		// first in a journey: the worker started by the fresh install stops when
		// idle and nothing here wakes it again.
		async writeStorageFromWorker(items) {
			const sw = await worker.worker();
			// The worker target shows up before Chrome binds the extension APIs
			// into it, so chrome can still be undefined for a moment.
			for (let i = 0; i < 50; i++) {
				if (await sw.evaluate(() => typeof chrome === "object")) break;
				await wait(100);
			}
			await sw.evaluate((i) => chrome.storage.local.set(i), items);
		},
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
		// Whether a panel element is shown, has a class, and where it links to.
		async panelLook(selector) {
			const panel = await panelTarget().asPage();
			return panel.$eval(selector, (e) => ({
				hidden: e.hidden,
				classes: [...e.classList],
				href: e.getAttribute("href"),
			}));
		},
		// Records the panel's confirm() messages and answers them with
		// watcher.accept, which a journey can flip between double-clicks.
		async watchPanelDialogs() {
			const panel = await panelTarget().asPage();
			const watcher = { accept: true, seen: [] };
			panel.on("dialog", (d) => {
				watcher.seen.push(d.message());
				watcher.accept ? d.accept() : d.dismiss();
			});
			return watcher;
		},
		// Records what the panel hands to speechSynthesis.speak() and whether
		// Chrome starts reading it, then lets the real call through.
		async watchPanelSpeech() {
			const panel = await panelTarget().asPage();
			await panel.evaluate(() => {
				window.spoken = [];
				const speak = speechSynthesis.speak.bind(speechSynthesis);
				speechSynthesis.speak = (utterance) => {
					const said = {
						text: utterance.text,
						lang: utterance.lang,
						voice: utterance.voice?.name,
					};
					utterance.addEventListener("start", () => {
						said.started = true;
					});
					window.spoken.push(said);
					speak(utterance);
				};
			});
			return async () => panel.evaluate(() => window.spoken.at(-1));
		},
		// Voices load after the page does, so wait for an English one to show up.
		// Returns the names of the English voices, or [] if none arrive.
		async panelEnglishVoices() {
			const panel = await panelTarget().asPage();
			return panel
				.waitForFunction(
					() => {
						const names = speechSynthesis
							.getVoices()
							.filter((v) => v.lang.startsWith("en"))
							.map((v) => v.name);
						return names.length > 0 && names;
					},
					{ polling: 200, timeout: 5000 },
				)
				.then(
					(handle) => handle.jsonValue(),
					() => [],
				);
		},
		// The section labels of the editor, top to bottom, among those shown.
		async panelTags() {
			const panel = await panelTarget().asPage();
			return panel.$$eval("#editor .tag", (tags) =>
				tags.filter((t) => t.checkVisibility()).map((t) => t.textContent),
			);
		},
		// The ids of the editor's controls the reader can type into.
		async panelEditables() {
			const panel = await panelTarget().asPage();
			return panel.$$eval(
				"#editor input, #editor textarea, #editor select, #editor [contenteditable]",
				(controls) =>
					controls.filter((c) => !c.disabled && !c.readOnly).map((c) => c.id),
			);
		},
		// Replaces a field's text by typing, as the reader would. With leave:
		// false the reader stays in the field and the panel stays in front,
		// since sending the panel tab to the back would blur the field too.
		async typeInPanel(id, text, { leave = true } = {}) {
			const panel = await panelTarget().asPage();
			await panel.bringToFront();
			await panel.$eval(`#${id}`, (e) => e.select());
			await panel.keyboard.type(text);
			if (leave) await this.leavePanelField();
		},
		// Tab out of the focused field, which fires change as when the reader
		// moves on.
		async leavePanelField() {
			const panel = await panelTarget().asPage();
			await panel.keyboard.press("Tab");
			await wait(300);
			await page.bringToFront();
		},
		// Clicks the element and types there, as a reader trying to write in it.
		async clickAndTypeInPanel(selector, text) {
			const panel = await panelTarget().asPage();
			await panel.bringToFront();
			await panel.click(selector);
			await panel.keyboard.type(text);
			await wait(300);
			await page.bringToFront();
		},
		// The URLs the panel requests from Wiktionary from now on, kept growing.
		async watchPanelRequests() {
			const panel = await panelTarget().asPage();
			const seen = [];
			panel.on("request", (r) => {
				if (r.url().startsWith("https://en.wiktionary.org/"))
					seen.push(r.url());
			});
			return seen;
		},
		// Delays every response to the panel by latency ms; 0 turns it off.
		async slowPanelNetwork(latency) {
			const panel = await panelTarget().asPage();
			await panel.emulateNetworkConditions(
				latency ? { download: -1, upload: -1, latency } : null,
			);
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
					labels: [...d.querySelectorAll(".tag")].map((t) => t.textContent),
					meanings: d.querySelector(".meanings").innerText,
					note: d.querySelector(".note")?.innerText ?? null,
					contexts: [...d.querySelectorAll("ol li")].map((li) => li.innerText),
				}),
			);
		},
		// Records the status text and whether the button is disabled at every
		// change from now on, to catch states that pass too fast to poll.
		async watchPanelStatus(statusSelector, buttonSelector) {
			const panel = await panelTarget().asPage();
			await panel.evaluate(
				(statusSelector, buttonSelector) => {
					const status = document.querySelector(statusSelector);
					const button = document.querySelector(buttonSelector);
					window.statusSeen = [];
					new MutationObserver(() =>
						window.statusSeen.push({
							text: status.textContent,
							disabled: button.disabled,
						}),
					).observe(document.querySelector("#list"), {
						subtree: true,
						childList: true,
						characterData: true,
						attributes: true,
					});
				},
				statusSelector,
				buttonSelector,
			);
			return () => panel.evaluate(() => window.statusSeen);
		},
		// Read-only look at the imported Eijiro headwords. Call it only after an
		// import: opening a database that doesn't exist yet creates it empty.
		async eijiroKeys() {
			const panel = await panelTarget().asPage();
			return panel.evaluate(
				() =>
					new Promise((resolve, reject) => {
						const open = indexedDB.open("eijiro");
						open.onerror = () => reject(open.error);
						open.onsuccess = () => {
							const request = open.result
								.transaction("words")
								.objectStore("words")
								.getAllKeys();
							request.onsuccess = () => {
								open.result.close();
								resolve(request.result);
							};
						};
					}),
			);
		},
		// Closing the panel tab and opening it again, as the reader closing and
		// reopening the side panel.
		async reopenPanel() {
			await (await panelTarget().asPage()).close();
			await this.openPanel();
		},
		// Read-only look at what was saved, for values the panel doesn't show as-is.
		async savedWords() {
			const panel = await panelTarget().asPage();
			return panel.evaluate(
				async () => (await chrome.storage.local.get("words")).words ?? {},
			);
		},
		// The Wiktionary section once the lookup is over. Waits for the real
		// dictionary, which the panel gives up on after 10s.
		async panelMeanings() {
			const panel = await panelTarget().asPage();
			await panel.waitForFunction(
				() =>
					document.getElementById("meanings").textContent !==
					"Wiktionary を引いています…",
				// The panel tab sits behind the page, where rAF-based polling never fires.
				{ polling: 200, timeout: 15000 },
			);
			return panel.$eval("#meanings", (e) => e.textContent);
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
		check(
			"URL はクリックで開けるリンクになっている",
			(await s.panelLook("#url a")).href === s.url,
			await s.panelLook("#url a"),
		);
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
			"Wiktionary の意味が品詞ごとに出る",
			meanings.startsWith("verb:\npresent participle and gerund of run"),
			meanings,
		);
		check(
			"品詞ごとの意味は 2 個まで",
			// Each group is its "verb:" line and the definitions under it.
			meanings.split("\n\n").every((group) => group.split("\n").length <= 3),
			meanings,
		);
		check(
			"文と URL も出る",
			(await s.panelText("sentence")) === "Running is good exercise." &&
				(await s.panelText("url")) === s.url,
		);
		await s.dblclick("#qwzxvbn");
		const missing = await s.panelMeanings();
		check(
			"Wiktionary にない語では、見つからなかったと出し、メモに書くよう案内する",
			missing.startsWith("Wiktionary に見つかりませんでした") &&
				missing.includes("メモに書いて") &&
				(await s.panelLook("#meanings")).classes.includes("muted"),
			missing,
		);
		await s.screenshot("meanings");
	},
	async save(s, check) {
		await s.openPanel();
		await s.dblclick("#running");
		await s.panelMeanings();
		await s.typeInPanel("word", "run");
		const shown = await s.panelMeanings();
		await s.typeInPanel("note", "走る\n走ること");
		await s.clickInPanel("#save");
		check("保存したと出る", (await s.panelText("status")) === "保存しました。");
		const { run } = await s.savedWords();
		check("書き換えた見出し語で保存される", run?.headword === "run");
		check("書いたメモが保存される", run?.note === "走る\n走ること", run?.note);
		check(
			"Wiktionary の欄に出ていた、直した語の意味が保存される",
			run?.meanings.length > 0 &&
				formatMeanings(run.meanings) === shown &&
				!shown.includes("present participle and gerund of run"),
			{ shown, saved: run?.meanings },
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
		const meanings = await s.panelMeanings();
		await s.typeInPanel("note", "どこにでもある");
		await s.clickInPanel("#save");
		const requests = await s.watchPanelRequests();
		await s.goto("/other");
		await s.dblclick("#again");
		check(
			"別のページでは、登録済みと出る",
			(await s.panelText("status")) === "登録済みの単語です。",
		);
		check(
			"Wiktionary を引き直さず、保存した意味とメモが出る",
			requests.length === 0 &&
				(await s.panelText("meanings")) === meanings &&
				(await s.panelText("note")) === "どこにでもある",
			{
				requests,
				meanings: await s.panelText("meanings"),
				note: await s.panelText("note"),
			},
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
	async rename(s, check) {
		await s.openPanel();
		await s.dblclick("#ubiquitous");
		const meanings = await s.panelMeanings();
		await s.typeInPanel("note", "どこにでもある");
		await s.clickInPanel("#save");
		const before = (await s.savedWords()).ubiquitous;
		await s.dblclick("#deprecated");
		await s.panelMeanings();
		await s.typeInPanel("word", "ubiquitous");
		check(
			"見出し語を登録済みの語に変えると、その語の保存内容に切り替わる",
			(await s.panelText("meanings")) === meanings &&
				(await s.panelText("note")) === "どこにでもある" &&
				(await s.panelContexts()) === 1,
			[
				await s.panelText("meanings"),
				await s.panelText("note"),
				await s.panelContexts(),
			],
		);
		check(
			"切り替わったことが注意の色で出る",
			(await s.panelText("status")).includes("登録済みの「ubiquitous」") &&
				(await s.panelLook("#status")).classes.includes("warning"),
			[await s.panelText("status"), await s.panelLook("#status")],
		);
		await s.clickInPanel("#save");
		const { ubiquitous, deprecated } = await s.savedWords();
		check(
			"保存しても意味とメモは上書きされず、今の文が文脈に足される",
			// chrome.storage hands objects back with their keys reordered.
			isDeepStrictEqual(ubiquitous?.meanings, before?.meanings) &&
				ubiquitous.note === "どこにでもある" &&
				ubiquitous.contexts.length === 2 &&
				ubiquitous.contexts[1].sentence ===
					"The U.S. team has deprecated the old API.",
			ubiquitous,
		);
		check("元の語は登録されない", deprecated === undefined);
		await s.screenshot("rename");
	},
	async unsaved(s, check) {
		await s.openPanel();
		const dialogs = await s.watchPanelDialogs();
		await s.dblclick("#ubiquitous");
		await s.panelMeanings();
		check(
			"新規の語を書き換えていなければ、未保存と出ない",
			(await s.panelLook("#unsaved")).hidden,
		);
		await s.dblclick("#idempotent");
		check(
			"書き換えていない新規の語からは、確認なしで切り替わる",
			dialogs.seen.length === 0 && (await s.panelText("word")) === "idempotent",
			dialogs.seen,
		);
		await s.panelMeanings();
		await s.typeInPanel("note", "冪等");
		check(
			"メモを書くと、未保存と出る",
			!(await s.panelLook("#unsaved")).hidden,
		);
		dialogs.accept = false;
		await s.dblclick("#deprecated");
		check(
			"書き換え中に別の語をダブルクリックすると、確認が出る",
			dialogs.seen.length === 1,
			dialogs.seen,
		);
		check(
			"確認でキャンセルすると、書き換えた内容が残る",
			(await s.panelText("word")) === "idempotent" &&
				(await s.panelText("note")) === "冪等",
			[await s.panelText("word"), await s.panelText("note")],
		);
		dialogs.accept = true;
		await s.dblclick("#deprecated");
		check(
			"確認で承認すると、その語に切り替わる",
			dialogs.seen.length === 2 && (await s.panelText("word")) === "deprecated",
		);
		await s.panelMeanings();
		await s.typeInPanel("note", "非推奨");
		await s.clickInPanel("#save");
		check(
			"保存すると、未保存の表示が消える",
			(await s.panelLook("#unsaved")).hidden,
		);
		await s.dblclick("#ubiquitous");
		check(
			"保存した後は、確認なしで切り替わる",
			dialogs.seen.length === 2 && (await s.panelText("word")) === "ubiquitous",
			dialogs.seen,
		);
		await s.screenshot("unsaved");
	},
	async persist(s, check) {
		await s.openPanel();
		await s.dblclick("#ubiquitous");
		const meanings = await s.panelMeanings();
		await s.typeInPanel("note", "どこにでもある");
		await s.clickInPanel("#save");
		const stillThere = async (label) => {
			await s.openPanel();
			await s.dblclick("#ubiquitous");
			check(
				`${label}も、登録済みと出て、保存した意味とメモが出る`,
				(await s.panelText("status")) === "登録済みの単語です。" &&
					(await s.panelText("meanings")) === meanings &&
					(await s.panelText("note")) === "どこにでもある",
				[
					await s.panelText("status"),
					await s.panelText("meanings"),
					await s.panelText("note"),
				],
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
			if (id === "#idempotent") await s.typeInPanel("note", "冪等");
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
			"単語をクリックすると、Wiktionary の意味、メモ、これまでの文脈が出る",
			detail.open &&
				isDeepStrictEqual(detail.labels, ["Wiktionary", "メモ"]) &&
				detail.meanings.length > 0 &&
				detail.note === "冪等" &&
				detail.contexts.length === 1 &&
				detail.contexts[0].startsWith(
					"単語 The API is ubiquitous and idempotent.",
				),
			detail,
		);
		const remove = '#words li[data-headword="ubiquitous"] .delete';
		await s.clickInPanel('#words li[data-headword="ubiquitous"] summary');
		check(
			"メモのない単語には、メモの欄が出ない",
			(await s.listDetail("ubiquitous")).note === null,
			await s.listDetail("ubiquitous"),
		);
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
		await s.typeInPanel("note", "どこにでもある");
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
			"書き出しで、メモを含む全データが版 2 の JSON ファイルとしてダウンロードされる",
			Boolean(file) &&
				JSON.parse(readFileSync(file, "utf8")).version === 2 &&
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

		const version1 = path.join(evidenceDir, "version-1.json");
		writeFileSync(
			version1,
			JSON.stringify({
				format: "wordtrail",
				version: 1,
				exportedAt: "2026-10-20T00:00:00Z",
				words: [
					{
						headword: "ubiquitous",
						meanings: [
							{
								partOfSpeech: "adjective",
								definitions: ["Being everywhere at once."],
							},
							{ partOfSpeech: "", definitions: ["どこにでもある"] },
						],
						contexts: [
							{
								sentence: "Ubiquitous sensors now watch every street.",
								url: "https://example.com/",
								addedAt: "2026-10-20T00:00:00Z",
							},
						],
						createdAt: "2026-10-20T00:00:00Z",
					},
				],
			}),
		);
		await s.chooseFileInPanel("#import", version1, { dialog: true });
		check(
			"メモができる前の版 1 のファイルも読み込める",
			isDeepStrictEqual(await s.listHeadwords(), ["ubiquitous"]),
			[await s.panelText("list-status"), await s.listHeadwords()],
		);
		await s.dblclick("#again");
		check(
			"版 1 の品詞のない意味はメモに、品詞のある意味は Wiktionary の欄に出る",
			(await s.panelText("note")) === "どこにでもある" &&
				(await s.panelText("meanings")) ===
					"adjective:\nBeing everywhere at once.",
			[await s.panelText("note"), await s.panelText("meanings")],
		);
		await s.screenshot("backup");
	},
	async memo(s, check) {
		await s.openPanel();
		await s.dblclick("#ubiquitous");
		const meanings = await s.panelMeanings();
		check(
			"編集画面で書ける欄は見出し語とメモだけで、Wiktionary の欄は書けない",
			isDeepStrictEqual(await s.panelEditables(), ["word", "note"]),
			await s.panelEditables(),
		);
		await s.clickAndTypeInPanel("#meanings", "xyz");
		check(
			"Wiktionary の欄をクリックして打っても、内容は変わらない",
			meanings.length > 0 &&
				(await s.panelText("meanings")) === meanings &&
				(await s.panelLook("#unsaved")).hidden,
			await s.panelText("meanings"),
		);
		const memo = "どこにでもある\n覚え方: ubi = どこでも";
		await s.typeInPanel("note", memo);
		check(
			"メモを書くと、未保存と出る",
			!(await s.panelLook("#unsaved")).hidden,
		);
		await s.clickInPanel("#save");
		check(
			"保存すると、メモが単語と一緒に入り、未保存の表示が消える",
			(await s.savedWords()).ubiquitous?.note === memo &&
				(await s.panelLook("#unsaved")).hidden,
			(await s.savedWords()).ubiquitous,
		);
		await s.reloadExtension();
		await s.openPanel();
		await s.dblclick("#ubiquitous");
		check(
			"拡張を再読み込みした後も、登録済みの単語を開くとメモと Wiktionary の意味が出る",
			(await s.panelText("note")) === memo &&
				(await s.panelText("meanings")) === meanings,
			[await s.panelText("note"), await s.panelText("meanings")],
		);
		await s.screenshot("memo-editor");
		await s.clickInPanel("#toggle-list");
		await s.clickInPanel('#words li[data-headword="ubiquitous"] summary');
		const detail = await s.listDetail("ubiquitous");
		check(
			"一覧では、Wiktionary とメモが別々のラベルで出る",
			isDeepStrictEqual(detail.labels, ["Wiktionary", "メモ"]) &&
				detail.meanings === meanings &&
				detail.note === memo,
			detail,
		);
		await s.screenshot("memo");
	},
	async relookup(s, check) {
		await s.openPanel();
		const requests = await s.watchPanelRequests();
		await s.dblclick("#running");
		const running = await s.panelMeanings();
		check(
			"準備: ダブルクリックした running を 1 回引く",
			requests.length === 1 && requests[0].endsWith("/running"),
			requests,
		);
		await s.typeInPanel("word", "run", { leave: false });
		await wait(1500);
		check(
			"見出し語の入力の途中では、Wiktionary を引き直さない",
			requests.length === 1 && (await s.panelText("meanings")) === running,
			requests,
		);
		await s.leavePanelField();
		const run = await s.panelMeanings();
		check(
			"見出し語の欄を離れると、直した語で Wiktionary を引き直して出す",
			requests.length === 2 &&
				requests[1].endsWith("/run") &&
				run.includes("verb:") &&
				!run.includes("present participle and gerund of run"),
			{ requests, run },
		);
		check(
			"引き直した結果は書き換えに数えず、見出し語を直したことだけで未保存と出る",
			!(await s.panelLook("#unsaved")).hidden,
		);
		await s.slowPanelNetwork(3000);
		await s.typeInPanel("word", "work");
		check(
			"準備: 遅い回線で、保存を押す時点ではまだ work を引いている",
			(await s.panelText("meanings")) === "Wiktionary を引いています…",
			await s.panelText("meanings"),
		);
		await s.clickInPanel("#save");
		const work = await s.panelMeanings();
		await s.slowPanelNetwork(0);
		await wait(500);
		const saved = (await s.savedWords()).work;
		check(
			"引き直しの途中で保存しても、直した語の意味で保存される",
			(await s.panelText("status")) === "保存しました。" &&
				saved?.meanings?.length > 0 &&
				formatMeanings(saved.meanings) === work &&
				work !== run,
			{ status: await s.panelText("status"), work, saved },
		);
		check(
			"元の語は登録されない",
			!("run" in (await s.savedWords())) &&
				!("running" in (await s.savedWords())),
		);
		await s.screenshot("relookup");
	},
	async migrate(s, check) {
		const adjective = {
			partOfSpeech: "adjective",
			definitions: ["Being everywhere at once."],
		};
		await s.writeStorageFromWorker({
			words: {
				ubiquitous: {
					headword: "ubiquitous",
					meanings: [
						adjective,
						{
							partOfSpeech: "",
							definitions: ["どこにでもある", "覚え方: ubi = どこでも"],
						},
					],
					contexts: [
						{
							sentence: "単語 The API is ubiquitous and idempotent.",
							url: s.url,
							addedAt: "2026-10-20T00:00:00Z",
						},
					],
					createdAt: "2026-10-20T00:00:00Z",
				},
			},
		});
		await s.reloadExtension();
		await s.openPanel();
		await s.dblclick("#ubiquitous");
		check(
			"移した後も、登録済みの単語として出る",
			(await s.panelText("status")) === "登録済みの単語です。",
			await s.panelText("status"),
		);
		check(
			"品詞のない意味は、メモに移る",
			(await s.panelText("note")) === "どこにでもある\n覚え方: ubi = どこでも",
			await s.panelText("note"),
		);
		check(
			"品詞のある意味は、Wiktionary の欄に残る",
			(await s.panelText("meanings")) ===
				"adjective:\nBeing everywhere at once.",
			await s.panelText("meanings"),
		);
		const { ubiquitous } = await s.savedWords();
		check(
			"保存の中身も移した後の形になり、文脈は残る",
			isDeepStrictEqual(ubiquitous?.meanings, [adjective]) &&
				ubiquitous.note === "どこにでもある\n覚え方: ubi = どこでも" &&
				ubiquitous.contexts.length === 1,
			ubiquitous,
		);
		await s.screenshot("migrate");
	},
	async speak(s, check) {
		await s.openPanel();
		const lastSpoken = await s.watchPanelSpeech();
		await s.dblclick("#ubiquitous");
		await s.panelMeanings();
		// Voices are listed only after the click, so the first click finds them
		// on its own, as it does for the reader.
		await s.clickInPanel("#speak-word");
		const word = await lastSpoken();
		const voices = await s.panelEnglishVoices();
		check("英語の声がある", voices.length > 0, voices);
		check(
			"見出し語のボタンで、見出し語を英語として読み上げる",
			word?.text === "ubiquitous" && word.lang === "en-US",
			word,
		);
		if (voices.includes("Samantha"))
			check(
				"Samantha があれば、最初のクリックから Samantha で読む",
				word?.voice === "Samantha",
				word,
			);
		check("読み上げが始まる", word?.started === true, word);
		const first = "単語 The API is ubiquitous and idempotent.";
		await s.clickInPanel("#speak-sentence");
		check(
			"文脈のボタンで、表示中の文を読み上げる",
			(await lastSpoken())?.text === first,
			await lastSpoken(),
		);
		await s.clickInPanel("#save");
		await s.goto("/other");
		await s.dblclick("#again");
		await s.clickInPanel("#contexts li:first-child .speak");
		check(
			"これまでの文脈のボタンで、前に出会った文を読み上げる",
			(await lastSpoken())?.text === first,
			await lastSpoken(),
		);
		await s.clickInPanel("#toggle-list");
		const entry = '#words li[data-headword="ubiquitous"]';
		await s.clickInPanel(`${entry} summary .speak`);
		check(
			"一覧の見出し語のボタンで見出し語を読み上げ、閉じた単語は閉じたまま",
			(await lastSpoken())?.text === "ubiquitous" &&
				!(await s.listDetail("ubiquitous")).open,
			{ spoken: await lastSpoken(), detail: await s.listDetail("ubiquitous") },
		);
		await s.clickInPanel(`${entry} summary`);
		await s.clickInPanel(`${entry} li:last-child .speak`);
		check(
			"一覧の文脈のボタンでも、その文を読み上げる",
			(await lastSpoken())?.text ===
				"Ubiquitous sensors now watch every street.",
			await lastSpoken(),
		);
		await s.clickInPanel(`${entry} summary .speak`);
		check(
			"開いた単語で見出し語のボタンを押しても、開いたまま",
			(await lastSpoken())?.text === "ubiquitous" &&
				(await s.listDetail("ubiquitous")).open,
			{ spoken: await lastSpoken(), detail: await s.listDetail("ubiquitous") },
		);
		await s.screenshot("speak");
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
	async "eijiro-import"(s, check, evidenceDir) {
		await s.openPanel();
		await s.clickInPanel("#toggle-list");
		check(
			"取り込む前は、取り込んでいないと出る",
			(await s.panelText("eijiro-status")) === "英辞郎は取り込んでいません。",
			await s.panelText("eijiro-status"),
		);

		const seen = await s.watchPanelStatus("#eijiro-status", "#eijiro");
		await s.chooseFileInPanel("#eijiro", eijiroSample);
		const states = await seen();
		check(
			"取り込み中はボタンが押せず、取り込み中と出る",
			states.some((x) => x.disabled && x.text === "英辞郎を取り込んでいます…"),
			states,
		);
		check(
			"取り込み終わると、語数とファイル名が出て、ボタンがまた押せる",
			isDeepStrictEqual(states.at(-1), {
				text: "英辞郎：5 語（eijiro-sample.txt）",
				disabled: false,
			}),
			states.at(-1),
		);
		check(
			"1 語の見出し語が、小文字ごとにまとめて取り込まれる",
			isDeepStrictEqual(await s.eijiroKeys(), [
				"colour",
				"don't",
				"run",
				"sample-word",
				"us",
			]),
			await s.eijiroKeys(),
		);
		await s.reopenPanel();
		await s.clickInPanel("#toggle-list");
		check(
			"パネルを開き直しても、語数とファイル名が出る",
			(await s.panelText("eijiro-status")) ===
				"英辞郎：5 語（eijiro-sample.txt）",
			await s.panelText("eijiro-status"),
		);

		// ■ is 0x81 0xA1 in Shift JIS and the rest is ASCII, which Shift JIS
		// shares, so this is a well-formed Eijiro file without an encoder.
		const replacement = path.join(evidenceDir, "replacement.txt");
		writeFileSync(
			replacement,
			Buffer.concat([
				Buffer.from([0x81, 0xa1]),
				Buffer.from("apple  {n} : APPLE\r\n"),
			]),
		);
		await s.chooseFileInPanel("#eijiro", replacement);
		check(
			"取り込み直すと、前のデータが置き換わる",
			(await s.panelText("eijiro-status")) ===
				"英辞郎：1 語（replacement.txt）" &&
				isDeepStrictEqual(await s.eijiroKeys(), ["apple"]),
			[await s.panelText("eijiro-status"), await s.eijiroKeys()],
		);

		const notEijiro = path.join(evidenceDir, "not-eijiro.json");
		writeFileSync(notEijiro, JSON.stringify({ format: "wordtrail" }));
		await s.chooseFileInPanel("#eijiro", notEijiro);
		check(
			"英辞郎でないファイルでは、失敗したと出て、前のデータが残る",
			(await s.panelText("eijiro-status")).startsWith("取り込めませんでした") &&
				isDeepStrictEqual(await s.eijiroKeys(), ["apple"]),
			[await s.panelText("eijiro-status"), await s.eijiroKeys()],
		);
		await s.screenshot("eijiro-import");
		await s.reopenPanel();
		await s.clickInPanel("#toggle-list");
		check(
			"失敗の後に開き直すと、前に取り込んだ語数とファイル名が出る",
			(await s.panelText("eijiro-status")) ===
				"英辞郎：1 語（replacement.txt）",
			await s.panelText("eijiro-status"),
		);
	},
	async "eijiro-panel"(s, check, evidenceDir) {
		await s.openPanel();
		await s.dblclick("#ubiquitous");
		await s.panelMeanings();
		check(
			"取り込む前は、英辞郎の欄が出ない",
			(await s.panelLook("#eijiro-section")).hidden &&
				!(await s.panelTags()).includes("英辞郎"),
			await s.panelTags(),
		);

		await s.clickInPanel("#toggle-list");
		await s.chooseFileInPanel("#eijiro", eijiroSample);
		await s.dblclick("#running");
		await s.panelMeanings();
		check(
			"取り込んだ後、英辞郎にない語では、見つからなかったと出る",
			(await s.panelText("translations")) === "英辞郎に見つかりませんでした。",
			await s.panelText("translations"),
		);
		check(
			"英辞郎の欄は Wiktionary の欄の上にあり、書き換えられない",
			isDeepStrictEqual((await s.panelTags()).slice(0, 2), [
				"英辞郎",
				"Wiktionary",
			]) && isDeepStrictEqual(await s.panelEditables(), ["word", "note"]),
			[await s.panelTags(), await s.panelEditables()],
		);

		await s.typeInPanel("word", "Run");
		await wait(500);
		check(
			"見出し語を直して欄を離れると、大文字と小文字を区別せずに引き直し、品詞ごとに番号付きで出る",
			(await s.panelText("translations")) ===
				"自動:\n1. 〔人が〕走る\n\n他動:\n1. 〔店を〕営む",
			await s.panelText("translations"),
		);
		await s.typeInPanel("word", "us");
		await wait(500);
		check(
			"綴りが違う見出し語には、元の綴りが付く",
			(await s.panelText("translations")) ===
				"US 略:\n1. 合衆国\n\n代名:\n1. 私たちを",
			await s.panelText("translations"),
		);
		await s.typeInPanel("word", "colour");
		await wait(500);
		check(
			"参照の行は、そのまま出る",
			(await s.panelText("translations")) === "名:\n1. ＝<→color>",
			await s.panelText("translations"),
		);

		await s.panelMeanings();
		await s.clickInPanel("#save");
		const saved = await s.savedWords();
		check(
			"保存した単語に、英辞郎の訳が入らない",
			Boolean(saved.colour) && !JSON.stringify(saved).includes("＝<→color>"),
			saved,
		);
		const downloads = path.join(evidenceDir, "downloads");
		mkdirSync(downloads, { recursive: true });
		await s.downloadTo(downloads);
		await s.clickInPanel("#toggle-list");
		await s.clickInPanel("#export");
		await wait(1000);
		const [exported] = readdirSync(downloads);
		const text = exported
			? readFileSync(path.join(downloads, exported), "utf8")
			: "";
		check(
			"書き出したファイルに、英辞郎の訳が入らない",
			text.includes('"colour"') && !text.includes("＝<→color>"),
			readdirSync(downloads),
		);

		await s.dblclick("#idempotent");
		await s.panelMeanings();
		await s.typeInPanel("word", "colour");
		await wait(500);
		check(
			"登録済みの単語を開いても、英辞郎の訳がその場で引かれて出る",
			(await s.panelText("status")).startsWith("登録済みの「colour」") &&
				(await s.panelText("translations")) === "名:\n1. ＝<→color>",
			[await s.panelText("status"), await s.panelText("translations")],
		);
		await s.screenshot("eijiro-panel");
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
