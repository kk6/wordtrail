#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
const extensionDir = path.join(root, "extension");
const chromePath =
	process.env.CHROME_PATH ??
	"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const fixtures = {
	"/": readFileSync(path.join(here, "fixtures/article.html")),
	"/frame": readFileSync(path.join(here, "fixtures/frame.html")),
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
	const browser = await puppeteer.launch({
		executablePath: chromePath,
		headless: false,
		pipe: true,
		defaultViewport: null,
		enableExtensions: [extensionDir],
		userDataDir: profile,
	});
	const worker = await browser.waitForTarget(
		(t) => t.type() === "service_worker",
	);
	const page = await browser.newPage();
	await page.goto(url);

	const panelTarget = () =>
		browser.targets().find((t) => t.url().endsWith("/panel.html"));

	return {
		url,
		extensionId: new URL(worker.url()).host,
		page,
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
		// The real entry is the toolbar icon, which puppeteer can't click, and a
		// CDP userGesture doesn't count as a gesture for sidePanel.open(). So the
		// panel page is opened in a tab instead.
		async openPanel() {
			const panel = await browser.newPage();
			await panel.goto(
				`chrome-extension://${new URL(worker.url()).host}/panel.html`,
			);
			await page.bringToFront();
			await wait(300);
		},
		async panelText(id) {
			const panel = await panelTarget().asPage();
			return panel.$eval(`#${id}`, (e) => e.textContent);
		},
		// Waits for the real dictionary, which the panel gives up on after 10s.
		async panelMeanings() {
			const panel = await panelTarget().asPage();
			await panel.waitForFunction(
				() =>
					!document
						.getElementById("meanings")
						.textContent.startsWith("辞書を引いています"),
				// The panel tab sits behind the page, where rAF-based polling never fires.
				{ polling: 200, timeout: 12000 },
			);
			return panel.$$eval("#meanings h2", (parts) =>
				parts.map((part) => ({
					partOfSpeech: part.textContent,
					definitions: [...part.nextElementSibling.children].map(
						(item) => item.textContent,
					),
				})),
			);
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
				(await s.panelText("meanings")).startsWith("辞書から意味を取れません"),
		);
		await s.screenshot("meanings");
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
		const check = (label, passed) => checks.push({ label, passed });
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
			console.log(`${c.passed ? "PASS" : "FAIL"} [${name}] ${c.label}`);
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
