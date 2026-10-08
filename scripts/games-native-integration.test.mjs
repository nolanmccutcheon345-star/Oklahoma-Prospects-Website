import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
test("Games is a native same-origin hub with five live sections and no external app dependency",()=>{
 const page=readFileSync("src/routes/games.tsx","utf8");
 const shell=readFileSync("src/components/app-shell.tsx","utf8");
 const api=readFileSync("src/lib/games-api.ts","utf8");
 for(const term of ['"watch"','"schedule"','"scores"','"replays"','"teams"'])
   assert.ok(page.includes(term),term);
 assert.match(page,/getPublicGames/);
 assert.match(page,/Games publishing desk/);
 assert.match(page,/setInterval\(update,30000\)/);
 assert.match(page,/videoEmbedUrl\(game.videoId\)/);
 assert.match(api,/authMiddleware/);
 assert.match(shell,/to: "\/games"/);
 assert.doesNotMatch(page,/chatgpt\.site|oklahoma-prospects-live|iframe.+chatgpt/i);
});
test("Original Steve live project is not modified or embedded by the new Games hub",()=>{
 const page=readFileSync("src/routes/games.tsx","utf8");
 assert.doesNotMatch(page,/src=["']https:\/\/oklahoma-prospects-live/);
 assert.match(page,/Coach Steve's Prospects Live concept/);
});

test("Games errors have an honest unavailable page separate from a genuinely empty schedule",()=>{
 const page=readFileSync("src/routes/games.tsx","utf8");
 assert.match(page,/loader:\\s*async\\s*\\(\\)\\s*=>/);
 assert.match(page,/games:\\[\\] as PublicGameEvent\\[\\],loaded:false/);
 assert.match(page,/function GamesUnavailable\\(\\)/);
 assert.match(page,/!hasLoaded && games.length===0/);
 assert.match(page,/No unverified game information is being shown/);
 assert.match(page,/function EmptyGames\\(\\)/);
});

test("Games default Watch tab does not force a redirect from the clean /games URL",()=>{
 const page=readFileSync("src/routes/games.tsx","utf8");
 assert.match(page,/const validView = .*GamesView\\|undefined/);
 assert.match(page,/requestedView\\?\\?"watch"/);
 assert.doesNotMatch(page,/VIEWS\\.find\\(v=>v\\.id===value\\)\\?\\.id \\?\\? "watch"/);
});
