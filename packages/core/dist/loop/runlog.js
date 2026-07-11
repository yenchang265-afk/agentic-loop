/**
 * Parse the durable run log (`<tasksDir>/runs/<id>.md`) back into structure.
 * The writers live beside this module: stage sections are appended by the
 * hosts via `appendRunLog` with `## <stage>[ (lens: <l>)] · iteration N · <ISO>`
 * headers, and terminal events append `## run · <outcome>` followed by the
 * `## Run summary · …` block from `renderRunSummary` (metrics.ts). Keeping
 * parser and writers in one package lets the round-trip be tested in one
 * place. Pure; tolerant of unknown sections (forward compatibility).
 */
/** Inverse of metrics.ts `formatDuration` (`1h 03m` / `2m 41s` / `45s`) → seconds. Pure. */
export const parseDuration = (text) => {
    let seconds = 0;
    const h = /(\d+)h/.exec(text);
    const m = /(\d+)m(?!s)/.exec(text);
    const s = /(\d+)s/.exec(text);
    if (h)
        seconds += Number(h[1]) * 3600;
    if (m)
        seconds += Number(m[1]) * 60;
    if (s)
        seconds += Number(s[1]);
    return seconds;
};
const STAGE_HEADER = /^(?<stage>[a-z][a-z0-9-]*)(?:\s+\(lens:\s*(?<lens>[^)]+)\))?\s+·\s+iteration\s+(?<iter>\d+)\s+·\s+(?<at>\S+)$/;
const SUMMARY_HEADER = /^Run summary\s+·\s+(?<outcome>[a-z]+)(?::\s+(?<detail>.*?))?\s+·\s+(?<at>\S+)$/;
const RUN_MARKER = /^run\s+·\s+/;
const FOOTER = /^iterations used:\s*(\d+)\/(\d+)\s+·\s+total:\s*(.+?)\s+·\s+outcome:/;
const ROW_STAGE = /^(?<stage>.+?)(?:\s+\((?<lens>[^)]+)\))?$/;
const splitBlocks = (markdown) => {
    const blocks = [];
    let current = null;
    for (const line of markdown.split("\n")) {
        const h2 = /^##\s+(.*)$/.exec(line);
        if (h2) {
            if (current)
                blocks.push(current);
            current = { header: h2[1].trim(), lines: [] };
        }
        else if (current) {
            current.lines.push(line);
        }
    }
    if (current)
        blocks.push(current);
    return blocks;
};
const parseTable = (lines) => {
    const tableLines = lines.filter((l) => l.trim().startsWith("|"));
    if (tableLines.length < 2)
        return [];
    const cells = (l) => l
        .trim()
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((c) => c.trim());
    const headers = cells(tableLines[0]).map((h) => h.toLowerCase());
    const rows = [];
    for (const line of tableLines.slice(1)) {
        const row = cells(line);
        if (row.every((c) => /^-+$/.test(c)))
            continue; // separator
        const byHeader = {};
        headers.forEach((h, i) => (byHeader[h] = row[i] ?? ""));
        const stageCell = byHeader["stage"] ?? "";
        const stageMatch = ROW_STAGE.exec(stageCell);
        const known = new Set(["#", "stage", "iter", "verdict", "wall-clock"]);
        const extra = {};
        for (const h of headers)
            if (!known.has(h))
                extra[h] = byHeader[h] ?? "";
        const verdictCell = byHeader["verdict"] ?? "—";
        const duration = byHeader["wall-clock"] ?? "";
        rows.push({
            stage: stageMatch?.groups?.["stage"] ?? stageCell,
            ...(stageMatch?.groups?.["lens"] ? { lens: stageMatch.groups["lens"] } : {}),
            iteration: Number(byHeader["iter"] ?? "0") || 0,
            ...(verdictCell && verdictCell !== "—" ? { verdict: verdictCell } : {}),
            duration,
            seconds: parseDuration(duration),
            extra,
        });
    }
    return rows;
};
/** Parse a run log's markdown. Unknown `##` sections are skipped. Pure. */
export const parseRunLog = (markdown) => {
    const sections = [];
    const summaries = [];
    for (const block of splitBlocks(markdown)) {
        if (RUN_MARKER.test(block.header))
            continue; // terminal marker; the summary follows as its own block
        const summary = SUMMARY_HEADER.exec(block.header);
        if (summary?.groups) {
            const footerLine = block.lines.map((l) => FOOTER.exec(l)).find(Boolean);
            summaries.push({
                outcome: summary.groups["outcome"],
                ...(summary.groups["detail"] ? { detail: summary.groups["detail"] } : {}),
                at: summary.groups["at"],
                rows: parseTable(block.lines),
                ...(footerLine
                    ? {
                        iterationsUsed: Number(footerLine[1]),
                        cap: Number(footerLine[2]),
                        total: footerLine[3],
                    }
                    : {}),
            });
            continue;
        }
        const stage = STAGE_HEADER.exec(block.header);
        if (stage?.groups) {
            sections.push({
                stage: stage.groups["stage"],
                ...(stage.groups["lens"] ? { lens: stage.groups["lens"] } : {}),
                iteration: Number(stage.groups["iter"]),
                at: stage.groups["at"],
                body: block.lines.join("\n").trim(),
            });
        }
        // anything else: unknown section — ignore
    }
    return { sections, summaries };
};
