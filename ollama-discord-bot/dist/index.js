import dotenv from "dotenv";
import { ChannelType, Client, ActivityType, AttachmentBuilder, GatewayIntentBits, PermissionFlagsBits, PresenceUpdateStatus, EmbedBuilder, REST, Routes, SlashCommandBuilder, } from "discord.js";
import { exec as execCb } from "child_process";
import http from "http";
import fs from "fs";
import path from "path";
import os from "os";
import util from "util";
import { compilerAvailable, decompilerAvailable, runCompile, runDecompile, } from "./compiler.js";
import { availableFxModels, compileFx, compileFxAuto, availableFxTools, runFxTool, } from "./fxesplus.js";
dotenv.config();
const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildIds = (process.env.DISCORD_GUILD_IDS || process.env.DISCORD_GUILD_ID || "")
    .split(",")
    .map((g) => g.trim())
    .filter(Boolean);
const adminPort = Number(process.env.ADMIN_UI_PORT || 3210);
const adminToken = process.env.ADMIN_UI_TOKEN;
if (!token || !clientId) {
    console.error("DISCORD_TOKEN and DISCORD_CLIENT_ID are required.");
    process.exit(1);
}
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});
const sessions = new Map();
const transcriptsDir = path.join(process.cwd(), "transcripts");
fs.mkdirSync(transcriptsDir, { recursive: true });
const transcriptsRoot = path.resolve(transcriptsDir);
const workspaceRoot = process.cwd();
const workspacesDir = path.join(process.cwd(), "workspaces");
fs.mkdirSync(workspacesDir, { recursive: true });
const WORKSPACE_TTL_MS = 60 * 60 * 1000; // 1 hour
const WORKSPACE_MAX_CONCURRENT = 3;
const WORKSPACE_IMAGE = process.env.WORKSPACE_IMAGE || "workspace-sandbox:latest";
const WORKSPACE_CPU = process.env.WORKSPACE_CPU || "0.5";
const WORKSPACE_MEM = process.env.WORKSPACE_MEM || "512m";
const WORKSPACE_PIDS = Number(process.env.WORKSPACE_PIDS || "256");
const WORKSPACE_ADMINS = new Set((process.env.WORKSPACE_ADMINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean));
const MAX_INLINE_LINES = 100;
const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2 MB cap for readfile
const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024; // cap for attachment inputs
const CMD_TIMEOUT_MS = 5000;
const CMD_MAX_BUFFER = 64 * 1024; // 64KB combined stdout/stderr
const MAX_OUTPUT_LINES = 100;
const STATUS_DISK_PATH = process.env.STATUS_DISK_PATH || "/mnt/internal_disk";
const execAsync = util.promisify(execCb);
const workspaceSessions = new Map();
const isWorkspaceAdmin = (userId) => WORKSPACE_ADMINS.has(userId);
const resolveWorkspaceFile = (dir, rel) => {
    const target = path.resolve(dir, rel);
    if (target === dir || target.startsWith(`${dir}${path.sep}`))
        return target;
    throw new Error("Path must stay within workspace directory");
};
const runDocker = async (cmd, options) => {
    const useSudo = process.env.USE_SUDO_DOCKER !== "0";
    const prefix = useSudo ? "sudo -n docker" : "docker";
    const res = await runCommand(`${prefix} ${cmd}`, options?.cwd);
    if (!res.ok && /sudo: a password is required/i.test(res.stderr || res.stdout)) {
        return {
            ok: false,
            stdout: "",
            stderr: "Docker needs passwordless sudo. Set USE_SUDO_DOCKER=0 if your user can run docker without sudo, or add NOPASSWD for docker in sudoers.",
        };
    }
    return res;
};
const runDockerExec = async (containerId, command, workdir = "/workspace") => {
    return runDocker(`exec -w ${workdir} ${containerId} bash -lc ${JSON.stringify(command)}`);
};
const findUserSession = (userId) => [...sessions.values()].find((s) => s.userId === userId);
const isGuildTextChannel = (channel) => channel?.type === ChannelType.GuildText;
const sendJson = (res, body, status = 200) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
};
const extToLang = (filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    const map = {
        ".ts": "ts",
        ".tsx": "tsx",
        ".js": "js",
        ".jsx": "jsx",
        ".json": "json",
        ".md": "md",
        ".py": "python",
        ".sh": "bash",
        ".bash": "bash",
        ".zsh": "bash",
        ".c": "c",
        ".cc": "cpp",
        ".cpp": "cpp",
        ".cxx": "cpp",
        ".h": "c",
        ".hpp": "cpp",
        ".rs": "rust",
        ".go": "go",
        ".java": "java",
        ".txt": "", // plain
        ".log": "",
        ".yaml": "yaml",
        ".yml": "yaml",
        ".toml": "toml",
        ".ini": "ini",
        ".env": "env",
    };
    return map[ext] ?? "";
};
const buildCodeblock = (body, lang) => `\u0060\u0060\u0060${lang}\n${body}\n\u0060\u0060\u0060`;
const truncateForDiscord = (text, limit = 1900) => text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
const FX_HELP_ANSI = `\u001b[1;37mList of available commands (fx580vnx only):\u001b[0m

\u001b[1;34m[Decompile]\u001b[0m
 \u001b[1;32mo!decomp <hex>\u001b[0m        Decompile hex to asm

\u001b[1;34m[Compile]\u001b[0m
 \u001b[1;32mo!comp <code/attachment>\u001b[0m        Compile asm to hex

\u001b[1;34m[Gadget Finder]\u001b[0m
 \u001b[1;32mo!find_gadget <gadget>\u001b[0m   Search gadgets in disassembly

\u001b[1;34m[Translation]\u001b[0m
 \u001b[1;32mo!vnx2cnx <gadgets>\u001b[0m  Translate gadgets fx580vnx → fx991cnx
 \u001b[1;32mo!cnx2vnx <gadgets>\u001b[0m  Translate gadgets fx991cnx → fx580vnx

\u001b[1;34m[Conversion]\u001b[0m
 \u001b[1;32mo!conv_hex <hex>\u001b[0m    Convert hex to tokens/characters
 \u001b[1;32mo!hex_split <hex>\u001b[0m   Split hex string to sort into variables
 \u001b[1;32mo!p2h <attachment>\u001b[0m    Convert attached image to hex
 \u001b[1;32mo!h2p <hex/attachment>\u001b[0m Convert hex to image

\u001b[1;34m[Generator]\u001b[0m
 \u001b[1;32mo!generate <prompt>\u001b[0m Chat with AI

\u001b[1;34m[General]\u001b[0m
 \u001b[1;32mo!help <vi/en/ >\u001b[0m               Show command list
 \u001b[1;32mo!usage <vi/en/ > <command>\u001b[0m    Show detailed usage of a command (no need for o!)

\u001b[1;37mContribute:\u001b[0m
  Created by luongvantam`;
const resolveWorkspacePath = (input) => {
    const target = path.resolve(workspaceRoot, input);
    if (target === workspaceRoot || target.startsWith(`${workspaceRoot}${path.sep}`))
        return target;
    throw new Error("Path must stay within workspace root");
};
const readFileForReply = (inputPath) => {
    const target = resolveWorkspacePath(inputPath);
    if (!fs.existsSync(target))
        throw new Error("File not found");
    const stat = fs.statSync(target);
    if (stat.isDirectory())
        throw new Error("Path is a directory");
    if (stat.size > MAX_FILE_BYTES)
        throw new Error("File too large (over 2MB)");
    const text = fs.readFileSync(target, "utf-8");
    const lines = text.split(/\r?\n/);
    const lang = extToLang(target);
    if (lines.length > MAX_INLINE_LINES) {
        const attachment = new AttachmentBuilder(Buffer.from(text, "utf-8"), { name: "temp.txt" });
        return { attachment, message: `File too long (${lines.length} lines). Sent as attachment.` };
    }
    const codeblock = buildCodeblock(text, lang);
    return { content: codeblock };
};
const splitCodeAndStdin = (input) => {
    const marker = "--stdin";
    const idx = input.indexOf(marker);
    if (idx === -1)
        return { code: input.trim(), stdin: "" };
    return {
        code: input.slice(0, idx).trim(),
        stdin: input.slice(idx + marker.length).trimStart(),
    };
};
const readAttachmentText = async (attachment) => {
    const res = await fetch(attachment.url);
    if (!res.ok)
        throw new Error(`Could not download attachment (${res.status})`);
    const len = Number(res.headers.get("content-length") || "0");
    if (len && len > MAX_ATTACHMENT_BYTES)
        throw new Error("Attachment too large (over 2MB)");
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_ATTACHMENT_BYTES)
        throw new Error("Attachment too large (over 2MB)");
    return buf.toString("utf-8");
};
const buildLongOutputResponse = (text, filename, intro) => {
    const lines = text.split(/\r?\n/);
    if (lines.length > MAX_OUTPUT_LINES || text.length > 1900) {
        const attachment = new AttachmentBuilder(Buffer.from(text, "utf-8"), { name: filename });
        const prefix = intro ? `${intro} ` : "";
        const note = lines.length > MAX_OUTPUT_LINES ? `${lines.length} lines` : `${text.length} chars`;
        return { content: `${prefix}Sent as attachment (${note}).`, files: [attachment] };
    }
    return { content: truncateForDiscord(text) };
};
const workspaceBlockedCommand = (command) => {
    const patterns = [
        /\bsudo\b/i,
        /\bapt(-get)?\b/i,
        /\bdnf\b/i,
        /\byum\b/i,
        /\bpacman\b/i,
        /\bapk\b/i,
        /\bdocker\b/i,
        /\bpodman\b/i,
        /\bsystemctl\b/i,
        /\bservice\b/i,
        /\bmount\b/i,
        /\bumount\b/i,
        /\bchmod\b/i,
        /\bchown\b/i,
        /\bkill\b/i,
        /\bshutdown\b/i,
        /\breboot\b/i,
        /(^|[\s;|])npm\s+(i|install)\s+-g\b/i,
        /(^|[\s;|])pip3?\s+install\b/i,
        /(^|[\s;|])nohup\b/i,
        /(^|[\s;|])tmux\b/i,
        /(^|[\s;|])screen\b/i,
        /&\s*$/,
        /(^|[\s;|])rm\s+-[rf]+\s+\/(\s|$)/i,
        /(^|[\s;|])rm\s+-[rf]+\s+--no-preserve-root/i,
        /(^|[\s;|])rm\s+-[rf]+\s+\*\s*$/i,
    ];
    return patterns.some((p) => p.test(command));
};
const findWorkspaceByUser = (userId) => [...workspaceSessions.values()].find((s) => s.userId === userId);
const createWorkspace = async (guild, user) => {
    if (workspaceSessions.size >= WORKSPACE_MAX_CONCURRENT)
        throw new Error("Workspace limit reached. Try again later.");
    const existing = findWorkspaceByUser(user.id);
    if (existing)
        throw new Error(`You already have a workspace at <#${existing.channelId}>.`);
    const safeName = `ws-${user.username}`
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .slice(0, 90) || `ws-${user.id}`;
    const channel = await guild.channels.create({
        name: safeName,
        type: ChannelType.GuildText,
        permissionOverwrites: [
            { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
            {
                id: user.id,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.ReadMessageHistory,
                ],
            },
            {
                id: guild.members.me?.id || guild.client.user.id,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.ReadMessageHistory,
                    PermissionFlagsBits.ManageChannels,
                ],
            },
        ],
    });
    if (!isGuildTextChannel(channel))
        throw new Error("Could not create workspace channel.");
    const dir = path.join(workspacesDir, `${user.id}-${Date.now()}`);
    fs.mkdirSync(dir, { recursive: true });
    // Launch sandbox container
    const name = `ws-${user.id}-${Date.now()}`;
    const runResult = await runDocker(`run -d --name ${name} --network none --cpus=${WORKSPACE_CPU} --memory=${WORKSPACE_MEM} --pids-limit=${WORKSPACE_PIDS} -w /workspace -v ${dir}:/workspace:rw ${WORKSPACE_IMAGE} tail -f /dev/null`);
    if (!runResult.ok || !runResult.stdout.trim()) {
        throw new Error(`Failed to start workspace container: ${runResult.stderr || runResult.stdout}`);
    }
    const containerId = runResult.stdout.trim();
    const session = {
        userId: user.id,
        channelId: channel.id,
        dir,
        expiresAt: Date.now() + WORKSPACE_TTL_MS,
        containerId,
    };
    workspaceSessions.set(channel.id, session);
    scheduleWorkspaceExpiry(session);
    return { channel, session };
};
const cleanupWorkspace = async (session, reason = "workspace closed") => {
    if (session.timer)
        clearTimeout(session.timer);
    workspaceSessions.delete(session.channelId);
    if (session.containerId) {
        await runDocker(`rm -f -s ${session.containerId}`).catch(() => { });
    }
    try {
        fs.rmSync(session.dir, { recursive: true, force: true });
    }
    catch (err) {
        console.error("Failed to remove workspace dir", err);
    }
    try {
        const channel = await client.channels.fetch(session.channelId).catch(() => null);
        if (channel && "delete" in channel) {
            await channel.delete(reason).catch(() => { });
        }
    }
    catch (err) {
        console.error("Failed to delete workspace channel", err);
    }
};
const scheduleWorkspaceExpiry = (session) => {
    const delay = Math.max(1000, session.expiresAt - Date.now());
    session.timer = setTimeout(async () => {
        const channel = client.channels.cache.get(session.channelId);
        if (channel && channel.isTextBased?.()) {
            channel.send?.("Workspace expired. Cleaning up.").catch(() => { });
        }
        await cleanupWorkspace(session, "workspace expired");
    }, delay);
};
const saveWorkspaceAttachment = async (session, attachment) => {
    const res = await fetch(attachment.url);
    if (!res.ok)
        throw new Error(`Download failed (${res.status})`);
    const len = Number(res.headers.get("content-length") || "0");
    if (len && len > MAX_ATTACHMENT_BYTES)
        throw new Error("Attachment too large (over 2MB)");
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_ATTACHMENT_BYTES)
        throw new Error("Attachment too large (over 2MB)");
    const safeName = path.basename(attachment.name || "upload.bin");
    const dest = path.join(session.dir, safeName);
    fs.writeFileSync(dest, buf);
    return dest;
};
const handleWorkspaceMessage = async (session, message) => {
    const isOwner = message.author.id === session.userId;
    const isAdmin = isWorkspaceAdmin(message.author.id);
    if (!isOwner && !isAdmin) {
        await message.reply("Not your workspace.");
        return;
    }
    const saved = [];
    for (const att of message.attachments.values()) {
        try {
            const dest = await saveWorkspaceAttachment(session, att);
            saved.push(path.basename(dest));
        }
        catch (err) {
            await message.reply(`Failed to save attachment: ${err.message || err}`);
            return;
        }
    }
    const content = message.content.trim();
    if (!content) {
        if (saved.length) {
            await message.reply(`Saved files: ${saved.join(", ")}`);
        }
        return;
    }
    const lower = content.toLowerCase();
    if (lower.startsWith(`${PREFIX_WORKSPACE} stop`)) {
        if (!isOwner && !isAdmin) {
            await message.reply("Not authorized to stop this workspace.");
            return;
        }
        await message.reply("Stopping workspace…");
        await cleanupWorkspace(session, "workspace stopped");
        return;
    }
    const inWorkspaceDir = (p) => resolveWorkspaceFile(session.dir, p);
    const runWorkspaceCode = async (lang, body) => {
        const { code, stdin } = splitCodeAndStdin(body);
        if (!code) {
            await message.reply(`Usage: !${lang}comp <file or code> [--stdin <input>]`);
            return;
        }
        const candidatePath = path.join(session.dir, code);
        const fileExists = fs.existsSync(candidatePath) && fs.statSync(candidatePath).isFile();
        const stdinText = stdin || "";
        if (fileExists) {
            const containerPath = `/workspace/${path.relative(session.dir, inWorkspaceDir(code))}`;
            if (lang === "py") {
                const run = await runDockerExec(session.containerId, `python3 ${containerPath}`, "/workspace");
                const resp = { content: formatOutputs(run.stdout, run.stderr, "python") };
                await message.reply(resp);
            }
            else if (lang === "cpp") {
                const bin = `/workspace/.cpp-run-${Date.now()}.out`;
                const compile = await runDockerExec(session.containerId, `g++ -std=c++17 -O0 -pipe -o ${bin} ${containerPath}`);
                if (!compile.ok) {
                    await message.reply({ content: formatOutputs("", compile.stderr || compile.stdout, "") });
                    return;
                }
                const run = await runDockerExec(session.containerId, bin, "/workspace");
                await message.reply({ content: formatOutputs(run.stdout, run.stderr, "") });
                await runDockerExec(session.containerId, `rm -f ${bin}`);
            }
            else {
                const run = await runDockerExec(session.containerId, `node ${containerPath}`, "/workspace");
                await message.reply({ content: formatOutputs(run.stdout, run.stderr, "js") });
            }
            return;
        }
        // Inline code: write to workspace then run.
        const tempFile = path.join(session.dir, lang === "cpp" ? "main.cpp" : lang === "py" ? "main.py" : "main.mjs");
        fs.writeFileSync(tempFile, code, "utf-8");
        const relTemp = `/workspace/${path.basename(tempFile)}`;
        if (lang === "py") {
            const run = await runDockerExec(session.containerId, `python3 ${relTemp}`, "/workspace");
            await message.reply({ content: formatOutputs(run.stdout, run.stderr, "python") });
        }
        else if (lang === "cpp") {
            const bin = `/workspace/.cpp-run-${Date.now()}.out`;
            const compile = await runDockerExec(session.containerId, `g++ -std=c++17 -O0 -pipe -o ${bin} ${relTemp}`);
            if (!compile.ok) {
                await message.reply({ content: formatOutputs("", compile.stderr || compile.stdout, "") });
                return;
            }
            const run = await runDockerExec(session.containerId, bin, "/workspace");
            await message.reply({ content: formatOutputs(run.stdout, run.stderr, "") });
            await runDockerExec(session.containerId, `rm -f ${bin}`);
        }
        else {
            const run = await runDockerExec(session.containerId, `node ${relTemp}`, "/workspace");
            await message.reply({ content: formatOutputs(run.stdout, run.stderr, "js") });
        }
    };
    if (lower.startsWith(PREFIX_PYCOMP)) {
        const body = content.slice(PREFIX_PYCOMP.length).trim();
        await runWorkspaceCode("py", body);
        return;
    }
    if (lower.startsWith(PREFIX_CPPCOMP)) {
        const body = content.slice(PREFIX_CPPCOMP.length).trim();
        await runWorkspaceCode("cpp", body);
        return;
    }
    if (lower.startsWith(PREFIX_JSCOMP)) {
        const body = content.slice(PREFIX_JSCOMP.length).trim();
        await runWorkspaceCode("js", body);
        return;
    }
    if (workspaceBlockedCommand(content)) {
        await message.reply("Command blocked (unsafe or disallowed).");
        return;
    }
    const ack = await message.reply("Running in workspace…");
    const run = await runDockerExec(session.containerId, content, "/workspace");
    const stderr = run.stderr || (!run.ok ? "command failed" : "");
    const formatted = formatOutputs(run.stdout, stderr, "bash");
    await ack.edit(formatted);
};
const promptForStdin = async (channel, userId, label) => {
    if (!channel || typeof channel.isTextBased !== "function" || !channel.isTextBased())
        return "";
    const promptText = `<@${userId}> Provide stdin for ${label} (If not needed, ignore this). Waiting 5s…`;
    const promptMsg = await channel.send({ content: promptText });
    try {
        const collected = await channel.awaitMessages({
            filter: (m) => m.author.id === userId,
            max: 1,
            time: 5000,
            errors: ["time"],
        });
        const input = collected.first()?.content ?? "";
        await promptMsg.edit({ content: `${promptText} Received.` });
        return input;
    }
    catch {
        await promptMsg.edit({ content: `${promptText} Timed out; running without stdin.` });
        return "";
    }
};
const ensureBinary = async (binary) => {
    try {
        await execAsync(`command -v ${binary}`, { timeout: CMD_TIMEOUT_MS });
    }
    catch (err) {
        throw new Error(`${binary} not available in container`);
    }
};
const runCommand = async (command, cwd, stdinText, env) => {
    // Basic guard for obviously destructive absolute rm; not a full sandbox.
    const destructive = /(^|[\s;|])rm\s+-[rf]+\s+\/(\s|$)/i.test(command)
        || /(^|[\s;|])rm\s+-[rf]+\s+--no-preserve-root/i.test(command);
    if (destructive) {
        return { ok: false, stdout: "", stderr: "Blocked destructive command" };
    }
    let tmpIn = null;
    let cmd = command;
    if (stdinText) {
        const dir = cwd || os.tmpdir();
        tmpIn = fs.mkdtempSync(path.join(dir, "stdin-"));
        const inFile = path.join(tmpIn, "in.txt");
        fs.writeFileSync(inFile, stdinText, "utf-8");
        cmd = `${command} < ${inFile}`;
    }
    try {
        const { stdout, stderr } = await execAsync(cmd, {
            timeout: CMD_TIMEOUT_MS,
            maxBuffer: CMD_MAX_BUFFER,
            cwd,
            shell: "/bin/bash",
            env: {
                PATH: process.env.PATH || "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
                PYTHONSAFEPATH: "1",
                PYTHONNOUSERSITE: "1",
                NODE_PATH: "",
                ...env,
            },
        });
        if (tmpIn)
            fs.rmSync(tmpIn, { recursive: true, force: true });
        return { ok: true, stdout: stdout || "", stderr: stderr || "" };
    }
    catch (err) {
        if (tmpIn)
            fs.rmSync(tmpIn, { recursive: true, force: true });
        return {
            ok: false,
            stdout: err?.stdout || "",
            stderr: err?.stderr || err?.message || String(err),
        };
    }
};
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const formatBytes = (bytes) => {
    const units = ["B", "KB", "MB", "GB", "TB"];
    let value = bytes;
    let idx = 0;
    while (value >= 1024 && idx < units.length - 1) {
        value /= 1024;
        idx += 1;
    }
    return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[idx]}`;
};
const makeBar = (pct, width = 14) => {
    const safePct = Math.max(0, Math.min(100, pct));
    const filled = Math.round((safePct / 100) * width);
    const empty = Math.max(0, width - filled);
    return `[${"#".repeat(filled)}${".".repeat(empty)}]`;
};
const sampleCpuPercent = async () => {
    const first = os.cpus();
    await delay(400);
    const second = os.cpus();
    const firstTotals = first.map((c) => {
        const t = c.times;
        return t.user + t.nice + t.sys + t.irq + t.idle;
    });
    const secondTotals = second.map((c) => {
        const t = c.times;
        return t.user + t.nice + t.sys + t.irq + t.idle;
    });
    let idleDelta = 0;
    let totalDelta = 0;
    for (let i = 0; i < first.length; i += 1) {
        const idle = second[i].times.idle - first[i].times.idle;
        const total = secondTotals[i] - firstTotals[i];
        idleDelta += idle;
        totalDelta += total;
    }
    if (totalDelta <= 0)
        return 0;
    return (1 - idleDelta / totalDelta) * 100;
};
const readSwap = () => {
    try {
        const text = fs.readFileSync("/proc/meminfo", "utf-8");
        const lines = Object.fromEntries(text
            .split(/\n/)
            .map((line) => line.match(/^(\w+):\s+(\d+)\s+kB$/))
            .filter(Boolean)
            .map((m) => [m[1], Number(m[2]) * 1024]));
        const total = Number(lines.SwapTotal || 0);
        const free = Number(lines.SwapFree || 0);
        return { total, used: Math.max(0, total - free) };
    }
    catch {
        return { total: 0, used: 0 };
    }
};
const readDisk = async (target) => {
    const res = await runCommand(`df -k ${JSON.stringify(target)}`);
    if (!res.ok)
        throw new Error(res.stderr || "df failed");
    const lines = res.stdout.trim().split(/\n/);
    const row = lines[lines.length - 1];
    const parts = row.trim().split(/\s+/);
    if (parts.length < 5)
        throw new Error("Unexpected df output");
    const total = Number(parts[1]) * 1024;
    const used = Number(parts[2]) * 1024;
    const avail = Number(parts[3]) * 1024;
    return { total, used, avail };
};
const collectHostStats = async () => {
    const [cpuPct, diskMaybe] = await Promise.all([
        sampleCpuPercent(),
        readDisk(STATUS_DISK_PATH).catch(() => null),
    ]);
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = Math.max(0, totalMem - freeMem);
    const swap = readSwap();
    const uptimeSec = os.uptime();
    const load1 = os.loadavg()[0];
    return {
        cpuPct,
        load1,
        memUsed: usedMem,
        memTotal: totalMem,
        swapUsed: swap.used,
        swapTotal: swap.total,
        diskUsed: diskMaybe?.used ?? 0,
        diskTotal: diskMaybe?.total ?? 0,
        diskAvail: diskMaybe?.avail ?? 0,
        uptimeSec,
    };
};
const buildStatusEmbed = (stats) => {
    const memPct = stats.memTotal ? (stats.memUsed / stats.memTotal) * 100 : 0;
    const swapPct = stats.swapTotal ? (stats.swapUsed / stats.swapTotal) * 100 : 0;
    const diskPct = stats.diskTotal ? (stats.diskUsed / stats.diskTotal) * 100 : 0;
    const diskValue = stats.diskTotal
        ? `${makeBar(diskPct)} ${formatBytes(stats.diskUsed)} / ${formatBytes(stats.diskTotal)} (${diskPct.toFixed(1)}%)\nPath: ${STATUS_DISK_PATH}\nFree: ${formatBytes(stats.diskAvail)}`
        : `Disk stats unavailable for ${STATUS_DISK_PATH}`;
    const fmtDuration = (seconds) => {
        const sec = Math.max(0, Math.floor(seconds));
        const days = Math.floor(sec / 86400);
        const hours = Math.floor((sec % 86400) / 3600);
        const minutes = Math.floor((sec % 3600) / 60);
        const parts = [];
        if (days)
            parts.push(`${days}d`);
        if (hours)
            parts.push(`${hours}h`);
        parts.push(`${minutes}m`);
        return parts.join(" ");
    };
    return new EmbedBuilder()
        .setTitle("Host status")
        .setDescription(`Active workspaces: ${workspaceSessions.size}/${WORKSPACE_MAX_CONCURRENT} | Image: ${WORKSPACE_IMAGE}`)
        .addFields({
        name: "CPU",
        value: `${makeBar(stats.cpuPct)} ${stats.cpuPct.toFixed(1)}% | load1 ${stats.load1.toFixed(2)}`,
    }, {
        name: "RAM",
        value: `${makeBar(memPct)} ${formatBytes(stats.memUsed)} / ${formatBytes(stats.memTotal)} (${memPct.toFixed(1)}%)`,
    }, {
        name: "Swap",
        value: stats.swapTotal
            ? `${makeBar(swapPct)} ${formatBytes(stats.swapUsed)} / ${formatBytes(stats.swapTotal)} (${swapPct.toFixed(1)}%)`
            : "Swap: not available",
    }, {
        name: "Disk",
        value: diskValue,
    }, {
        name: "Uptime",
        value: `${fmtDuration(stats.uptimeSec)} | Limits: CPU ${WORKSPACE_CPU}, Mem ${WORKSPACE_MEM}, PIDs ${WORKSPACE_PIDS}`,
    })
        .setTimestamp(new Date());
};
const formatOutputs = (stdout, stderr, lang = "") => {
    const parts = [];
    if (stdout?.trim())
        parts.push(`stdout:\n${stdout.trim()}`);
    if (stderr?.trim())
        parts.push(`stderr:\n${stderr.trim()}`);
    if (!parts.length)
        parts.push("(no output)");
    return buildCodeblock(truncateForDiscord(parts.join("\n\n")), lang);
};
const runCpp = async (code, stdinText) => {
    await ensureBinary("g++");
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "casiobot-cpp-"));
    const srcPath = path.join(tmpDir, "main.cpp");
    const binPath = path.join(tmpDir, "main.out");
    fs.writeFileSync(srcPath, code, "utf-8");
    const compile = await runCommand(`g++ -std=c++17 -O0 -pipe -o ${binPath} ${srcPath}`, tmpDir);
    if (!compile.ok) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        return { content: formatOutputs("", compile.stderr || compile.stdout || "compile failed", "") };
    }
    const run = await runCommand(binPath, tmpDir, stdinText);
    fs.rmSync(tmpDir, { recursive: true, force: true });
    return { content: formatOutputs(run.stdout, run.stderr, "") };
};
const runCppFile = async (filePath, cwd, stdinText) => {
    await ensureBinary("g++");
    const binPath = path.join(cwd, `.cpp-run-${Date.now()}.out`);
    const compile = await runCommand(`g++ -std=c++17 -O0 -pipe -o ${binPath} ${filePath}`, cwd);
    if (!compile.ok) {
        return { content: formatOutputs("", compile.stderr || compile.stdout || "compile failed", "") };
    }
    const run = await runCommand(binPath, cwd, stdinText);
    try {
        fs.rmSync(binPath, { force: true });
    }
    catch { }
    return { content: formatOutputs(run.stdout, run.stderr, "") };
};
const runPython = async (code, stdinText) => {
    await ensureBinary("python3");
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "casiobot-py-"));
    const srcPath = path.join(tmpDir, "main.py");
    fs.writeFileSync(srcPath, code, "utf-8");
    const run = await runCommand(`python3 ${srcPath}`, tmpDir, stdinText, {
        PYTHONUNBUFFERED: "1",
    });
    fs.rmSync(tmpDir, { recursive: true, force: true });
    return { content: formatOutputs(run.stdout, run.stderr, "python") };
};
const runPythonFile = async (filePath, cwd, stdinText) => {
    await ensureBinary("python3");
    const run = await runCommand(`python3 ${filePath}`, cwd, stdinText, {
        PYTHONUNBUFFERED: "1",
    });
    return { content: formatOutputs(run.stdout, run.stderr, "python") };
};
const runJs = async (code, stdinText) => {
    await ensureBinary("node");
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "casiobot-js-"));
    const srcPath = path.join(tmpDir, "main.mjs");
    fs.writeFileSync(srcPath, code, "utf-8");
    const run = await runCommand(`node ${srcPath}`, tmpDir, stdinText, {
        NODE_OPTIONS: "--unhandled-rejections=strict",
    });
    fs.rmSync(tmpDir, { recursive: true, force: true });
    return { content: formatOutputs(run.stdout, run.stderr, "js") };
};
const runJsFile = async (filePath, cwd, stdinText) => {
    await ensureBinary("node");
    const run = await runCommand(`node ${filePath}`, cwd, stdinText, {
        NODE_OPTIONS: "--unhandled-rejections=strict",
    });
    return { content: formatOutputs(run.stdout, run.stderr, "js") };
};
const wikiLookup = async (query) => {
    const encoded = encodeURIComponent(query.trim());
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`;
    try {
        const res = await fetch(url);
        if (!res.ok)
            throw new Error(`Wiki responded ${res.status}`);
        const data = await res.json();
        const summary = data.extract || "(no summary)";
        const title = data.title || query;
        const link = data.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encoded}`;
        const body = `${title}\n${summary}\n\n${link}`;
        return truncateForDiscord(body, 1800);
    }
    catch (err) {
        return `Could not fetch wiki summary: ${err.message || err}. Link: https://en.wikipedia.org/wiki/${encoded}`;
    }
};
const isHexish = (input) => {
    const clean = input.replace(/[^0-9a-fA-F]/g, "");
    return clean.length > 0 && clean.length % 2 === 0 && /^[0-9a-fA-F\s]+$/.test(input);
};
const adminHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Bot Admin</title>
  <style>
    body { font-family: sans-serif; margin: 16px; background:#0b1220; color:#e5e7eb; }
    h1 { margin: 0 0 12px; }
    .row { display: flex; gap: 12px; align-items: center; margin-bottom: 12px; }
    input { padding: 6px 8px; background:#111827; border:1px solid #1f2937; color:#e5e7eb; border-radius:4px; min-width: 240px; }
    button { padding: 6px 10px; background:#2563eb; color:white; border:none; border-radius:4px; cursor:pointer; }
    button:hover { background:#1d4ed8; }
    .card { background:#111827; border:1px solid #1f2937; border-radius:6px; padding:12px; margin-bottom:12px; }
    .list { display:grid; gap:8px; }
    pre { white-space: pre-wrap; background:#0f172a; padding:12px; border-radius:6px; border:1px solid #1f2937; }
    a { color:#93c5fd; }
  </style>
</head>
<body>
  <h1>Bot Admin</h1>
  <div class="row">
    <input id="token" type="password" placeholder="Admin token (if set)" />
    <button onclick="refresh()">Refresh</button>
  </div>
  <div class="card">
    <h2>Active Sessions</h2>
    <div id="sessions" class="list"></div>
  </div>
  <div class="card">
    <h2>Transcripts</h2>
    <div id="transcripts" class="list"></div>
  </div>
  <div class="card">
    <h2>Transcript Viewer</h2>
    <div id="viewer">Select a transcript to view.</div>
  </div>
<script>
const state = { token: "" };

async function fetchJson(url) {
  const headers = state.token ? { "x-admin-token": state.token } : {};
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function fetchText(url) {
  const headers = state.token ? { "x-admin-token": state.token } : {};
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(await res.text());
  return res.text();
}

function renderSessions(list) {
  const root = document.getElementById("sessions");
  if (!list.length) { root.innerHTML = "<em>No active sessions</em>"; return; }
  root.innerHTML = list.map(function (s) {
    const last = (s.log && s.log.slice(-1)[0] && s.log.slice(-1)[0].content || "").slice(0, 140);
    return '<div class="card">'
      + '<div><strong>User:</strong> ' + s.userId + '</div>'
      + '<div><strong>Channel:</strong> ' + s.channelId + '</div>'
      + '<div><strong>Turns:</strong> ' + s.turns + '</div>'
      + '<div><strong>Last:</strong> ' + last + '</div>'
      + '</div>';
  }).join("");
}

function renderTranscripts(files) {
  const root = document.getElementById("transcripts");
  if (!files.length) { root.innerHTML = "<em>No transcripts yet</em>"; return; }
  root.innerHTML = files.map(function (f) {
    return '<div><a href="#" onclick="loadTranscript(\'' + encodeURIComponent(f) + '\');return false;">' + f + '</a></div>';
  }).join("");
}

async function loadTranscript(fileEnc) {
  try {
    const text = await fetchText('/api/transcript?file=' + fileEnc);
    document.getElementById("viewer").innerHTML = '<pre>' + text.replace(/</g,'&lt;') + '</pre>';
  } catch (err) {
    document.getElementById("viewer").textContent = 'Error: ' + err.message;
  }
}

async function refresh() {
  state.token = document.getElementById("token").value.trim();
  try {
    const results = await Promise.all([
      fetchJson("/api/sessions"),
      fetchJson("/api/transcripts"),
    ]);
    renderSessions(results[0]);
    renderTranscripts(results[1]);
  } catch (err) {
    alert(err.message || err);
  }
}

refresh();
</script>
</body>
</html>`;
const isAuthorized = (req, urlObj) => {
    if (!adminToken)
        return true;
    const headerToken = req.headers["x-admin-token"];
    const queryToken = urlObj.searchParams.get("token");
    return headerToken === adminToken || queryToken === adminToken;
};
const convertAdrOfToLegacyAdr = (code) => {
    const converted = code.replace(/adr_of\s+([A-Za-z_][\w]*)/gi, "adr($1)");
    return { converted, changed: converted !== code };
};
const convertLabelColonToLegacyLbl = (code) => {
    // Handles lines like `label:` with optional surrounding spaces/carriage returns.
    const converted = code.replace(/^\s*([A-Za-z_][\w]*)\s*:\s*$/gm, "lbl $1");
    return { converted, changed: converted !== code };
};
const shouldSkipFx = (code) => {
    const lowered = code.toLowerCase();
    // Heuristic: commands not in fx gadgets; send straight to legacy.
    return lowered.includes("printline") || lowered.includes("render.ddd4");
};
const startAdminServer = () => {
    const server = http.createServer((req, res) => {
        const urlObj = new URL(req.url || "/", "http://localhost");
        if (!isAuthorized(req, urlObj)) {
            res.writeHead(401, { "content-type": "text/plain" });
            res.end("Unauthorized");
            return;
        }
        if (req.method === "GET" && urlObj.pathname === "/api/sessions") {
            const payload = [...sessions.values()].map((s) => ({
                userId: s.userId,
                channelId: s.channelId,
                turns: s.turns,
                transcriptPath: path.basename(s.transcriptPath),
                log: s.log,
            }));
            sendJson(res, payload);
            return;
        }
        if (req.method === "GET" && urlObj.pathname === "/api/transcripts") {
            try {
                const files = fs
                    .readdirSync(transcriptsDir)
                    .filter((f) => f.toLowerCase().endsWith(".txt"))
                    .sort()
                    .reverse();
                sendJson(res, files);
            }
            catch (err) {
                sendJson(res, { error: err.message || String(err) }, 500);
            }
            return;
        }
        if (req.method === "GET" && urlObj.pathname === "/api/transcript") {
            const file = urlObj.searchParams.get("file");
            if (!file) {
                res.writeHead(400, { "content-type": "text/plain" });
                res.end("Missing file");
                return;
            }
            const target = path.resolve(transcriptsRoot, file);
            const withinRoot = target === transcriptsRoot || target.startsWith(`${transcriptsRoot}${path.sep}`);
            if (!withinRoot) {
                res.writeHead(400, { "content-type": "text/plain" });
                res.end("Invalid path");
                return;
            }
            if (!fs.existsSync(target)) {
                res.writeHead(404, { "content-type": "text/plain" });
                res.end("Not found");
                return;
            }
            try {
                const text = fs.readFileSync(target, "utf-8");
                res.writeHead(200, { "content-type": "text/plain" });
                res.end(text);
            }
            catch (err) {
                res.writeHead(500, { "content-type": "text/plain" });
                res.end(err.message || String(err));
            }
            return;
        }
        res.writeHead(200, { "content-type": "text/html" });
        res.end(adminHtml);
    });
    server.listen(adminPort, () => {
        console.log(`Admin UI listening on :${adminPort}`);
    });
    server.on("error", (err) => {
        console.error("Admin UI failed to start", err);
    });
};
startAdminServer();
const formatTranscript = (log) => log.map((entry) => `[${entry.role}] ${entry.content}`).join("\n");
const saveTranscript = (session) => {
    try {
        fs.writeFileSync(session.transcriptPath, formatTranscript(session.log), "utf-8");
    }
    catch (err) {
        console.error("Failed to write transcript", err);
    }
};
const LONGCHAT_INACTIVITY_MS = 5 * 24 * 60 * 60 * 1000; // 5 days
const LONGCHAT_MAX_TURNS = 30;
const resetInactivityTimer = (session, channel) => {
    if (session.timer)
        clearTimeout(session.timer);
    session.timer = setTimeout(async () => {
        sessions.delete(session.channelId);
        saveTranscript(session);
        try {
            await channel.send("Closing chat due to inactivity. Transcript saved.");
            await channel.delete("Long chat expired");
        }
        catch (err) {
            console.error("Failed to close inactive chat", err);
        }
    }, LONGCHAT_INACTIVITY_MS);
};
const endSession = async (session, reason = "Chat finished") => {
    if (session.timer)
        clearTimeout(session.timer);
    sessions.delete(session.channelId);
    saveTranscript(session);
    try {
        const channel = await client.channels.fetch(session.channelId);
        if (!channel || !isGuildTextChannel(channel))
            return;
        await channel.send(`${reason}. Transcript saved to ${path.basename(session.transcriptPath)}`);
        await channel.delete(reason);
    }
    catch (err) {
        console.error("Failed to end session", err);
    }
};
const fxModels = availableFxModels();
const fxModelChoiceTuples = fxModels.map((m) => ({ name: m, value: m }));
const fxTools = availableFxTools();
const fxToolChoiceTuples = fxTools.map((t) => ({ name: t, value: t }));
// Slash commands
const commands = [
    new SlashCommandBuilder().setName("help").setDescription("Show bot commands"),
    new SlashCommandBuilder()
        .setName("compile")
        .setDescription("Compile (or auto-decompile when hex)")
        .addStringOption((opt) => opt.setName("code").setDescription("Program body").setRequired(true)),
    new SlashCommandBuilder()
        .setName("fxcompile")
        .setDescription("Compile fxesplus program (model optional)")
        .addStringOption((opt) => opt.setName("code").setDescription("Program body").setRequired(true))
        .addStringOption((opt) => {
        opt.setName("model").setDescription("Calculator model (optional)").setRequired(false);
        if (fxModelChoiceTuples.length) {
            opt.addChoices(...fxModelChoiceTuples);
        }
        return opt;
    })
        .addStringOption((opt) => opt
        .setName("format")
        .setDescription("Output format")
        .addChoices({ name: "hex", value: "hex" }, { name: "key", value: "key" })),
    new SlashCommandBuilder()
        .setName("cppcomp")
        .setDescription("Compile C++ code")
        .addStringOption((opt) => opt.setName("code").setDescription("C++ source").setRequired(false))
        .addAttachmentOption((opt) => opt.setName("file").setDescription("Upload C++ source").setRequired(false))
        .addStringOption((opt) => opt.setName("stdin").setDescription("Optional stdin").setRequired(false)),
    new SlashCommandBuilder()
        .setName("pycomp")
        .setDescription("Run Python code")
        .addStringOption((opt) => opt.setName("code").setDescription("Python source").setRequired(false))
        .addAttachmentOption((opt) => opt.setName("file").setDescription("Upload Python source").setRequired(false))
        .addStringOption((opt) => opt.setName("stdin").setDescription("Optional stdin").setRequired(false)),
    new SlashCommandBuilder()
        .setName("jscomp")
        .setDescription("Run JS code")
        .addStringOption((opt) => opt.setName("code").setDescription("JavaScript source").setRequired(false))
        .addAttachmentOption((opt) => opt.setName("file").setDescription("Upload JavaScript source").setRequired(false))
        .addStringOption((opt) => opt.setName("stdin").setDescription("Optional stdin").setRequired(false)),
    new SlashCommandBuilder()
        .setName("wiki")
        .setDescription("Lookup a wiki topic")
        .addStringOption((opt) => opt.setName("query").setDescription("Topic to search").setRequired(true)),
    new SlashCommandBuilder().setName("status").setDescription("Show host resource status"),
    new SlashCommandBuilder()
        .setName("fxtool")
        .setDescription("Run fxesplus helper tool (.py in fxesplus root)")
        .addStringOption((opt) => {
        opt.setName("tool").setDescription("Tool file, e.g., checksum.py").setRequired(true);
        if (fxToolChoiceTuples.length)
            opt.addChoices(...fxToolChoiceTuples);
        return opt;
    })
        .addStringOption((opt) => opt
        .setName("args")
        .setDescription("Arguments separated by space (optional)")
        .setRequired(false)),
    new SlashCommandBuilder()
        .setName("decompile")
        .setDescription("Decompile hex back to DSL")
        .addStringOption((opt) => opt.setName("hex").setDescription("Hex bytes to decompile").setRequired(true)),
].map((c) => c.toJSON());
async function registerCommands() {
    const rest = new REST({ version: "10" }).setToken(token);
    if (guildIds.length) {
        for (const gid of guildIds) {
            await rest.put(Routes.applicationGuildCommands(clientId, gid), { body: commands });
            console.log(`Registered guild commands for guild ${gid}`);
        }
        return;
    }
    await rest.put(Routes.applicationCommands(clientId), { body: commands });
    console.log("Registered global commands (may take up to 1 hour to propagate)");
}
client.once("clientReady", async () => {
    console.log(`Logged in as ${client.user?.tag}`);
    try {
        await registerCommands();
    }
    catch (err) {
        console.error("Failed to register commands", err);
    }
    try {
        // Bots cannot set a Discord "Custom Status"; use a standard activity instead.
        client.user?.setPresence({
            activities: [{ name: "Đang lọ chéo cùng JS アイドル", type: ActivityType.Playing }],
            status: PresenceUpdateStatus.Idle,
        });
    }
    catch (err) {
        console.error("Failed to set presence", err);
    }
});
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand())
        return;
    if (interaction.commandName === "chat") {
        await interaction.reply({ content: "Chat is disabled (no API key).", ephemeral: true });
        return;
    }
    if (interaction.commandName === "help") {
        const lines = [
            "Commands:",
            "Slash: /compile, /fxcompile, /fxtool, /decompile, /cppcomp, /pycomp, /jscomp, /wiki, /status, /help",
            "Prefix: !comp, !fxcomp, !decomp, !fxtool, !readfile, !cppcomp, !pycomp, !jscomp, !wiki, !status, !help",
            "Notes: code runners accept optional stdin (slash option or --stdin). File inputs capped at 2MB. Workspaces and chat are disabled.",
        ];
        await interaction.reply({ content: lines.join("\n"), ephemeral: true });
        return;
    }
    if (interaction.commandName === "status") {
        await interaction.deferReply({ ephemeral: true });
        try {
            const stats = await collectHostStats();
            const embed = buildStatusEmbed(stats);
            await interaction.editReply({ embeds: [embed] });
        }
        catch (err) {
            await interaction.editReply({ content: `status failed: ${err.message || err}` });
        }
        return;
    }
    if (interaction.commandName === "workspace") {
        await interaction.reply({ content: "Workspaces are disabled.", ephemeral: true });
        return;
    }
    if (interaction.commandName === "readfile") {
        const relPath = interaction.options.getString("path", true).trim();
        await interaction.deferReply({ ephemeral: true });
        try {
            const result = readFileForReply(relPath);
            if (result.attachment) {
                await interaction.editReply({ content: result.message, files: [result.attachment] });
            }
            else {
                await interaction.editReply({ content: result.content });
            }
        }
        catch (err) {
            await interaction.editReply({ content: `readfile error: ${err.message || err}` });
        }
        return;
    }
    if (interaction.commandName === "cppcomp") {
        const codeStr = interaction.options.getString("code")?.trim() || "";
        const file = interaction.options.getAttachment("file");
        let code = codeStr;
        if (!code && file) {
            code = await readAttachmentText(file);
        }
        if (!code) {
            await interaction.reply({ content: "Provide code text or attach a file (<=2MB).", ephemeral: true });
            return;
        }
        await interaction.deferReply({ ephemeral: true });
        let stdinText = interaction.options.getString("stdin") || "";
        if (!stdinText) {
            stdinText = await promptForStdin(interaction.channel, interaction.user.id, "C++ run");
        }
        try {
            const result = await runCpp(code, stdinText || undefined);
            await interaction.editReply(result);
        }
        catch (err) {
            await interaction.editReply({ content: `cppcomp error: ${err.message || err}` });
        }
        return;
    }
    if (interaction.commandName === "pycomp") {
        const codeStr = interaction.options.getString("code")?.trim() || "";
        const file = interaction.options.getAttachment("file");
        let code = codeStr;
        if (!code && file) {
            code = await readAttachmentText(file);
        }
        if (!code) {
            await interaction.reply({ content: "Provide code text or attach a file (<=2MB).", ephemeral: true });
            return;
        }
        await interaction.deferReply({ ephemeral: true });
        let stdinText = interaction.options.getString("stdin") || "";
        if (!stdinText) {
            stdinText = await promptForStdin(interaction.channel, interaction.user.id, "Python run");
        }
        try {
            const result = await runPython(code, stdinText || undefined);
            await interaction.editReply(result);
        }
        catch (err) {
            await interaction.editReply({ content: `pycomp error: ${err.message || err}` });
        }
        return;
    }
    if (interaction.commandName === "jscomp") {
        const codeStr = interaction.options.getString("code")?.trim() || "";
        const file = interaction.options.getAttachment("file");
        let code = codeStr;
        if (!code && file) {
            code = await readAttachmentText(file);
        }
        if (!code) {
            await interaction.reply({ content: "Provide code text or attach a file (<=2MB).", ephemeral: true });
            return;
        }
        await interaction.deferReply({ ephemeral: true });
        let stdinText = interaction.options.getString("stdin") || "";
        if (!stdinText) {
            stdinText = await promptForStdin(interaction.channel, interaction.user.id, "JavaScript run");
        }
        try {
            const result = await runJs(code, stdinText || undefined);
            await interaction.editReply(result);
        }
        catch (err) {
            await interaction.editReply({ content: `jscomp error: ${err.message || err}` });
        }
        return;
    }
    if (interaction.commandName === "wiki") {
        const query = interaction.options.getString("query", true);
        await interaction.deferReply({ ephemeral: true });
        const summary = await wikiLookup(query);
        await interaction.editReply({ content: truncateForDiscord(summary) });
        return;
    }
    if (interaction.commandName === "stopchat") {
        const sessionByChannel = sessions.get(interaction.channelId);
        const sessionByUser = findUserSession(interaction.user.id);
        const active = sessionByChannel || sessionByUser;
        if (!active) {
            await interaction.reply({
                content: `No active long chat. Start one with ${PREFIX_LONGCHAT} <topic> or /longchat <topic>.`,
                ephemeral: true,
            });
            return;
        }
        await interaction.reply({ content: "Stopping chat and saving transcript…", ephemeral: true });
        await endSession(active, "Stopped by user");
        return;
    }
    if (interaction.commandName === "longchat") {
        if (!interaction.guild) {
            await interaction.reply({
                content: "Long chat sessions must be started in a server.",
                ephemeral: true,
            });
            return;
        }
        const existing = findUserSession(interaction.user.id);
        if (existing) {
            await interaction.reply({
                content: `You already have a session at <#${existing.channelId}>.`,
                ephemeral: true,
            });
            return;
        }
        const botMember = interaction.guild.members.me;
        if (!botMember?.permissions.has(PermissionFlagsBits.ManageChannels)) {
            await interaction.reply({
                content: "I need Manage Channels to create a long chat channel.",
                ephemeral: true,
            });
            return;
        }
        const topic = interaction.options.getString("topic")?.trim() || "long chat";
        const safeName = `chat-${interaction.user.username}`
            .toLowerCase()
            .replace(/[^a-z0-9-]/g, "-")
            .slice(0, 90) || `chat-${interaction.user.id}`;
        try {
            const channel = await interaction.guild.channels.create({
                name: safeName,
                type: ChannelType.GuildText,
                permissionOverwrites: [
                    {
                        id: interaction.guild.roles.everyone.id,
                        deny: [PermissionFlagsBits.ViewChannel],
                    },
                    {
                        id: interaction.user.id,
                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.SendMessages,
                            PermissionFlagsBits.ReadMessageHistory,
                        ],
                    },
                    {
                        id: botMember.id,
                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.SendMessages,
                            PermissionFlagsBits.ReadMessageHistory,
                            PermissionFlagsBits.ManageChannels,
                        ],
                    },
                ],
            });
            if (!isGuildTextChannel(channel)) {
                await interaction.reply({
                    content: "Could not create a text channel for long chat.",
                    ephemeral: true,
                });
                return;
            }
            const transcriptPath = path.join(transcriptsDir, `${interaction.user.id}-${Date.now()}-${safeName}.txt`);
            const newSession = {
                userId: interaction.user.id,
                channelId: channel.id,
                log: [{ role: "user", content: `Topic: ${topic}` }],
                turns: 0,
                transcriptPath,
            };
            sessions.set(channel.id, newSession);
            resetInactivityTimer(newSession, channel);
            await channel.send(`Long chat opened for <@${interaction.user.id}>. Topic: ${topic}. Use ${PREFIX_STOPCHAT} or /stopchat to finish and save the transcript.`);
            await interaction.reply({
                content: `Channel ${channel} created. Continue the conversation there.`,
                ephemeral: true,
            });
        }
        catch (err) {
            console.error("Failed to create long chat channel", err);
            await interaction.reply({
                content: `Could not create long chat channel: ${err.message || err}`,
                ephemeral: true,
            });
        }
        return;
    }
    if (interaction.commandName === "fxcompile") {
        const requestedModel = interaction.options.getString("model");
        const code = interaction.options.getString("code", true);
        const format = interaction.options.getString("format");
        await interaction.deferReply({ ephemeral: true });
        const available = availableFxModels();
        if (!available.length) {
            await interaction.editReply("No fxesplus models found in fxesplus/.");
            return;
        }
        const model = requestedModel && available.includes(requestedModel)
            ? requestedModel
            : available[0];
        try {
            const output = await compileFx(model, code, { format: format || "hex" });
            const content = output.length > 1900 ? `${output.slice(0, 1900)}…` : output;
            await interaction.editReply(content || "(empty output)");
        }
        catch (err) {
            await interaction.editReply(`fxcompile failed: ${err.message || err}`);
        }
        return;
    }
    if (interaction.commandName === "fxtool") {
        const tool = interaction.options.getString("tool", true);
        const argsRaw = interaction.options.getString("args")?.trim();
        const args = argsRaw ? argsRaw.split(/\s+/) : [];
        await interaction.deferReply({ ephemeral: true });
        const availableTools = availableFxTools();
        if (!availableTools.includes(tool)) {
            await interaction.editReply(`Tool ${tool} not found. Available: ${availableTools.join(", ") || "none"}.`);
            return;
        }
        try {
            const out = await runFxTool(tool, { args });
            const content = out.length > 1900 ? `${out.slice(0, 1900)}…` : out;
            await interaction.editReply(content || "(empty output)");
        }
        catch (err) {
            await interaction.editReply(`fxtool failed: ${err.message || err}`);
        }
        return;
    }
    if (interaction.commandName === "compile") {
        const code = interaction.options.getString("code", true);
        await interaction.deferReply({ ephemeral: true });
        const hexMode = isHexish(code);
        if (hexMode) {
            if (!decompilerAvailable()) {
                await interaction.editReply("Decompiler missing. Provide compiler/decompiler assets.");
                return;
            }
            try {
                const out = await runDecompile(code);
                const response = buildLongOutputResponse(out, "decompile.txt", "Decompile output.");
                await interaction.editReply(response);
            }
            catch (err) {
                await interaction.editReply(`Decompile failed: ${err.message || err}`);
            }
            return;
        }
        // Compile path (auto try all fxesplus models first, unless we know they won't handle it)
        const availableFx = availableFxModels();
        const skipFx = shouldSkipFx(code);
        let fxError = null;
        if (availableFx.length && !skipFx) {
            try {
                const { model, output } = await compileFxAuto(code, { format: "hex" });
                const response = buildLongOutputResponse(output, "compile.txt", `[${model}]`);
                await interaction.editReply(response);
                return;
            }
            catch (err) {
                fxError = err?.message || String(err);
                // fall through to legacy compiler
            }
        }
        if (!compilerAvailable()) {
            await interaction.editReply("compiler assets missing. Add rom.bin, disas.txt, gadgets.txt, labels.txt, labels_sfr.txt, extensions.txt under compiler/.");
            return;
        }
        const adrFix = convertAdrOfToLegacyAdr(code);
        const lblFix = convertLabelColonToLegacyLbl(adrFix.converted);
        const converted = lblFix.converted;
        const changed = adrFix.changed || lblFix.changed;
        try {
            const hex = await runCompile(converted);
            const response = buildLongOutputResponse(hex, "compile.txt", changed ? "[legacy shim]" : undefined);
            await interaction.editReply(response);
        }
        catch (err) {
            const legacyErr = err?.message || String(err);
            await interaction.editReply(fxError && !skipFx
                ? `fxcompile failed → ${fxError}; legacy compile failed → ${legacyErr}`
                : `Compile failed: ${legacyErr}`);
        }
        return;
    }
    if (interaction.commandName === "decompile") {
        const hex = interaction.options.getString("hex", true);
        await interaction.deferReply({ ephemeral: true });
        if (!decompilerAvailable()) {
            await interaction.editReply("Decompiler missing. Ensure compiler/decompiler.py and assets exist.");
            return;
        }
        try {
            const output = await runDecompile(hex);
            const response = buildLongOutputResponse(output, "decompile.txt", "Decompile output.");
            await interaction.editReply(response);
        }
        catch (err) {
            await interaction.editReply({ content: `Decompile failed: ${err.message || err}` });
        }
        return;
    }
});
const PREFIX_HELP = "!help";
const PREFIX_COMP = "!comp";
const PREFIX_FXCOMP = "!fxcomp";
const PREFIX_DECOMP = "!decomp";
const PREFIX_FXTOOL = "!fxtool";
const PREFIX_WORKSPACE = "!workspace";
const PREFIX_READFILE = "!readfile";
const PREFIX_CPPCOMP = "!cppcomp";
const PREFIX_PYCOMP = "!pycomp";
const PREFIX_JSCOMP = "!jscomp";
const PREFIX_WIKI = "!wiki";
const PREFIX_STATUS = "!status";
const PREFIX_CHAT = "!chat";
const PREFIX_LONGCHAT = "!longchat";
const PREFIX_STOPCHAT = "!stop-chat";
client.on("messageCreate", async (message) => {
    if (message.author.bot)
        return;
    const content = message.content.trim();
    const contentLower = content.toLowerCase();
    const workspaceSession = workspaceSessions.get(message.channel.id);
    if (workspaceSession) {
        await message.reply("Workspaces are disabled; cleaning up this workspace.");
        await cleanupWorkspace(workspaceSession, "workspaces disabled");
        return;
    }
    if (contentLower === PREFIX_HELP) {
        const lines = [
            "Commands:",
            "Slash: /compile, /fxcompile, /fxtool, /decompile, /cppcomp, /pycomp, /jscomp, /wiki, /status, /help",
            "Prefix: !comp, !fxcomp, !decomp, !fxtool, !readfile, !cppcomp, !pycomp, !jscomp, !wiki, !status, !help",
            "Notes: code runners accept optional stdin (slash option or --stdin). File inputs capped at 2MB. Workspaces and chat are disabled.",
        ];
        await message.reply(lines.join("\n"));
        return;
    }
    if (contentLower === PREFIX_STATUS) {
        const ack = await message.reply("Collecting status…");
        try {
            const stats = await collectHostStats();
            const embed = buildStatusEmbed(stats);
            await ack.edit({ content: "", embeds: [embed] });
        }
        catch (err) {
            await ack.edit({ content: `status failed: ${err.message || err}` });
        }
        return;
    }
    if (contentLower.startsWith(PREFIX_CHAT) ||
        contentLower.startsWith(PREFIX_LONGCHAT) ||
        contentLower.startsWith(PREFIX_STOPCHAT)) {
        await message.reply("Chat/longchat are disabled (no API key).");
        return;
    }
    if (content.startsWith(PREFIX_WORKSPACE)) {
        await message.reply("Workspaces are disabled.");
        return;
    }
    if (content.startsWith(PREFIX_READFILE)) {
        await message.reply("Workspaces/readfile are disabled.");
        return;
    }
    // FX compile
    if (content.startsWith(PREFIX_FXCOMP)) {
        const body = content.slice(PREFIX_FXCOMP.length).trimStart();
        const firstSpace = body.indexOf(" ");
        const modelToken = firstSpace === -1 ? body : body.slice(0, firstSpace).trim();
        const code = firstSpace === -1 ? "" : body.slice(firstSpace + 1).trim();
        if (!modelToken || !code) {
            await message.reply(`Usage: ${PREFIX_FXCOMP} <model> <program>`);
            return;
        }
        const available = availableFxModels();
        if (!available.includes(modelToken)) {
            await message.reply(`Unknown or unavailable model "${modelToken}". Available: ${available.join(", ") || "none"}.`);
            return;
        }
        const ack = await message.reply("Compiling with fxesplus…");
        try {
            const out = await compileFx(modelToken, code, { format: "hex" });
            const contentOut = out.length > 1900 ? `${out.slice(0, 1900)}…` : out;
            await ack.edit(contentOut || "(empty output)");
        }
        catch (err) {
            await ack.edit(`fxcompile failed: ${err.message || err}`);
        }
        return;
    }
    // FX tool
    if (content.startsWith(PREFIX_FXTOOL)) {
        const body = content.slice(PREFIX_FXTOOL.length).trimStart();
        if (!body) {
            await message.reply(`Usage: ${PREFIX_FXTOOL} <tool.py> [args...] (available: ${availableFxTools().join(", ") || "none"})`);
            return;
        }
        const parts = body.split(/\s+/);
        const tool = parts[0];
        const args = parts.slice(1);
        const tools = availableFxTools();
        if (!tools.includes(tool)) {
            await message.reply(`Tool ${tool} not found. Available: ${tools.join(", ") || "none"}.`);
            return;
        }
        const ack = await message.reply(`Running ${tool}…`);
        try {
            const out = await runFxTool(tool, { args });
            const contentOut = out.length > 1900 ? `${out.slice(0, 1900)}…` : out;
            await ack.edit(contentOut || "(empty output)");
        }
        catch (err) {
            await ack.edit(`fxtool failed: ${err.message || err}`);
        }
        return;
    }
    // Compile
    if (content.startsWith(PREFIX_COMP)) {
        let body = content.slice(PREFIX_COMP.length).trimStart();
        if (!body && message.attachments.size) {
            const att = message.attachments.first();
            try {
                body = await readAttachmentText(att);
            }
            catch (err) {
                await message.reply(`Could not read attachment: ${err.message || err}`);
                return;
            }
        }
        if (!body) {
            await message.reply("Usage: !comp <program | hex> (optional model as first word, or attach a file)");
            return;
        }
        const hexMode = isHexish(body);
        if (hexMode) {
            if (!decompilerAvailable()) {
                await message.reply("Decompiler missing. Provide compiler/decompiler assets.");
                return;
            }
            const ack = await message.reply("Decompiling…");
            try {
                const out = await runDecompile(body);
                const response = buildLongOutputResponse(out, "decompile.txt", "Decompile output.");
                await ack.edit(response);
            }
            catch (err) {
                await ack.edit(`Decompile failed: ${err.message || err}`);
            }
            return;
        }
        const available = availableFxModels();
        const skipFx = shouldSkipFx(body);
        const ack = await message.reply(available.length && !skipFx ? "Compiling with fxesplus…" : "Compiling…");
        let fxError = null;
        if (available.length && !skipFx) {
            try {
                const { model, output } = await compileFxAuto(body, { format: "hex" });
                const response = buildLongOutputResponse(output, "compile.txt", `[${model}]`);
                await ack.edit(response);
                return;
            }
            catch (err) {
                fxError = err?.message || String(err);
                // fall through to legacy
            }
        }
        if (!compilerAvailable()) {
            await ack.edit("compiler assets missing. Add rom.bin, disas.txt, gadgets.txt, labels.txt, labels_sfr.txt, extensions.txt under compiler/.");
            return;
        }
        const adrFix = convertAdrOfToLegacyAdr(body);
        const lblFix = convertLabelColonToLegacyLbl(adrFix.converted);
        const converted = lblFix.converted;
        const changed = adrFix.changed || lblFix.changed;
        try {
            const hex = await runCompile(converted);
            const response = buildLongOutputResponse(hex, "compile.txt", changed ? "[legacy shim]" : undefined);
            await ack.edit(response);
        }
        catch (err) {
            const legacyErr = err?.message || String(err);
            await ack.edit(fxError && !skipFx
                ? `fxcompile failed → ${fxError}; legacy compile failed → ${legacyErr}`
                : `Compile failed: ${legacyErr}`);
        }
        return;
    }
    // Decompile
    if (content.startsWith(PREFIX_DECOMP)) {
        let body = content.slice(PREFIX_DECOMP.length).trimStart();
        if (!body && message.attachments.size) {
            const att = message.attachments.first();
            try {
                body = await readAttachmentText(att);
            }
            catch (err) {
                await message.reply(`Could not read attachment: ${err.message || err}`);
                return;
            }
        }
        if (!body) {
            await message.reply("Usage: !decomp <hex bytes> (or attach a file)");
            return;
        }
        if (!decompilerAvailable()) {
            await message.reply("Decompiler missing. Ensure compiler/decompiler.py and assets exist.");
            return;
        }
        const ack = await message.reply("Decompiling…");
        try {
            const out = await runDecompile(body);
            const response = buildLongOutputResponse(out, "decompile.txt", "Decompile output.");
            await ack.edit(response);
        }
        catch (err) {
            await ack.edit(`Decompile failed: ${err.message || err}`);
        }
        return;
    }
    // C++ run
    if (content.startsWith(PREFIX_CPPCOMP)) {
        let body = content.slice(PREFIX_CPPCOMP.length).trim();
        if (!body && message.attachments.size) {
            const att = message.attachments.first();
            try {
                body = await readAttachmentText(att);
            }
            catch (err) {
                await message.reply(`Could not read attachment: ${err.message || err}`);
                return;
            }
        }
        const { code, stdin } = splitCodeAndStdin(body);
        if (!code) {
            await message.reply(`Usage: ${PREFIX_CPPCOMP} <code> [--stdin <input>]`);
            return;
        }
        const stdinText = stdin || (await promptForStdin(message.channel, message.author.id, "C++ run"));
        const ack = await message.reply("Compiling C++…");
        try {
            const result = await runCpp(code, stdinText || undefined);
            await ack.edit(result);
        }
        catch (err) {
            await ack.edit(`cppcomp error: ${err.message || err}`);
        }
        return;
    }
    // Python run
    if (content.startsWith(PREFIX_PYCOMP)) {
        let body = content.slice(PREFIX_PYCOMP.length).trim();
        if (!body && message.attachments.size) {
            const att = message.attachments.first();
            try {
                body = await readAttachmentText(att);
            }
            catch (err) {
                await message.reply(`Could not read attachment: ${err.message || err}`);
                return;
            }
        }
        const { code, stdin } = splitCodeAndStdin(body);
        if (!code) {
            await message.reply(`Usage: ${PREFIX_PYCOMP} <code> [--stdin <input>]`);
            return;
        }
        const stdinText = stdin || (await promptForStdin(message.channel, message.author.id, "Python run"));
        const ack = await message.reply("Running Python…");
        try {
            const result = await runPython(code, stdinText || undefined);
            await ack.edit(result);
        }
        catch (err) {
            await ack.edit(`pycomp error: ${err.message || err}`);
        }
        return;
    }
    // JavaScript run
    if (content.startsWith(PREFIX_JSCOMP)) {
        let body = content.slice(PREFIX_JSCOMP.length).trim();
        if (!body && message.attachments.size) {
            const att = message.attachments.first();
            try {
                body = await readAttachmentText(att);
            }
            catch (err) {
                await message.reply(`Could not read attachment: ${err.message || err}`);
                return;
            }
        }
        const { code, stdin } = splitCodeAndStdin(body);
        if (!code) {
            await message.reply(`Usage: ${PREFIX_JSCOMP} <code> [--stdin <input>]`);
            return;
        }
        const stdinText = stdin || (await promptForStdin(message.channel, message.author.id, "JavaScript run"));
        const ack = await message.reply("Running JavaScript…");
        try {
            const result = await runJs(code, stdinText || undefined);
            await ack.edit(result);
        }
        catch (err) {
            await ack.edit(`jscomp error: ${err.message || err}`);
        }
        return;
    }
    // Wiki
    if (content.startsWith(PREFIX_WIKI)) {
        const query = content.slice(PREFIX_WIKI.length).trim();
        if (!query) {
            await message.reply(`Usage: ${PREFIX_WIKI} <topic>`);
            return;
        }
        const ack = await message.reply("Searching wiki…");
        const summary = await wikiLookup(query);
        await ack.edit(truncateForDiscord(summary));
    }
});
//# sourceMappingURL=index.js.map