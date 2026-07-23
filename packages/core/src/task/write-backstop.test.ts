import assert from "node:assert/strict"
import { test } from "node:test"
import {
  chainedAdoAzWriteViolation,
  chainedAdoWriteBackstopViolation,
  chainedGithubPrMutation,
  chainedGitPushViolation,
  isAdoAzWriteViolation,
  isAdoMcpMutationTool,
  isAdoWriteBackstopViolation,
  isGithubPrMutation,
  isGitPushViolation,
  splitSegments,
} from "./write-backstop.js"

/**
 * Vectors shared with the twin `plugins/claude/hooks/src/allowlist.mjs`
 * (tested in plugins/claude/hooks/check-stage-guard.test.mjs) — keep the two
 * suites in sync so the classifiers can't drift between hosts.
 */

const ADO_PRS = "https://dev.azure.com/org/proj/_apis/git/repositories/abc/pullRequests"

test("splitSegments splits on unquoted operators only", () => {
  assert.deepEqual(splitSegments("git status && git diff"), ["git status", "git diff"])
  assert.deepEqual(splitSegments(`gh pr comment 1 --body "fixed A && B"`), [`gh pr comment 1 --body "fixed A && B"`])
  assert.deepEqual(splitSegments("a; b | c"), ["a", "b", "c"])
})

test("isGithubPrMutation flags PR state changes and the merge REST route", () => {
  assert.equal(isGithubPrMutation("gh pr merge 12"), true)
  assert.equal(isGithubPrMutation("gh pr close 12"), true)
  assert.equal(isGithubPrMutation("gh pr review --approve 12"), true)
  assert.equal(isGithubPrMutation("gh api -X PUT repos/o/r/pulls/12/merge"), true)
  assert.equal(isGithubPrMutation("gh api --method DELETE repos/o/r/issues/1/comments/9"), true)
  assert.equal(isGithubPrMutation("gh api repos/o/r/pulls/12/merge -X PUT"), true)
})

test("isGithubPrMutation flags review submissions, including the POST implied by a body flag", () => {
  assert.equal(isGithubPrMutation("gh api -X POST repos/o/r/pulls/12/reviews -f event=APPROVE"), true)
  // No -X at all: -f makes gh send POST — the implicit-POST hole.
  assert.equal(isGithubPrMutation("gh api repos/o/r/pulls/12/reviews -f event=APPROVE"), true)
  assert.equal(isGithubPrMutation("gh api repos/o/r/pulls/12/requested_reviewers -F 'reviewers[]=x'"), true)
  // GET reads of reviews stay allowed.
  assert.equal(isGithubPrMutation("gh api repos/o/r/pulls/12/reviews"), false)
})

test("isGithubPrMutation allows reads and comment replies", () => {
  assert.equal(isGithubPrMutation("gh pr comment 12 --body done"), false)
  assert.equal(isGithubPrMutation("gh pr view 12"), false)
  assert.equal(isGithubPrMutation("gh api repos/o/r/pulls/12"), false)
  assert.equal(isGithubPrMutation("gh api repos/o/r/pulls/12/comments -f body=done"), false)
  assert.equal(isGithubPrMutation("gh api repos/o/r/pulls/12/comments/9/replies -f body=done"), false)
})

test("isAdoWriteBackstopViolation allows GET reads, thread replies, and creating a PR", () => {
  assert.equal(isAdoWriteBackstopViolation(`curl -sS -u :"$PAT" "${ADO_PRS}/123?api-version=7.1"`), false)
  assert.equal(isAdoWriteBackstopViolation(`curl -sS -u :"$PAT" -X POST -d '{}' "${ADO_PRS}/123/threads/9/comments?api-version=7.1"`), false)
  assert.equal(isAdoWriteBackstopViolation(`curl -sS -u :"$PAT" -d '{"isDraft":true}' "${ADO_PRS}?api-version=7.1"`), false)
})

test("isAdoWriteBackstopViolation blocks completes, votes, and non-thread POSTs", () => {
  assert.equal(isAdoWriteBackstopViolation(`curl -sS -u :"$PAT" -X PATCH -d '{}' "${ADO_PRS}/123?api-version=7.1"`), true)
  assert.equal(isAdoWriteBackstopViolation(`curl -sS -u :"$PAT" -X PUT -d '{}' "${ADO_PRS}/123/reviewers/me?api-version=7.1"`), true)
  assert.equal(isAdoWriteBackstopViolation(`curl -sS -u :"$PAT" -X POST -d '{}' "${ADO_PRS}/123/reviewers?api-version=7.1"`), true)
})

test("isGitPushViolation flags force, delete, cross-branch, and default-branch pushes", () => {
  assert.equal(isGitPushViolation("git push --force origin feature/x"), true)
  assert.equal(isGitPushViolation("git push origin :feature/x"), true)
  // Short and bundled flag forms of force/delete — `-d` and `-fd` are
  // git-legal spellings of `--delete` / `--force --delete`.
  assert.equal(isGitPushViolation("git push -d origin feature/x"), true)
  assert.equal(isGitPushViolation("git push origin --delete feature/x"), true)
  assert.equal(isGitPushViolation("git push -fd origin feature/x"), true)
  assert.equal(isGitPushViolation("git push -df origin feature/x"), true)
  assert.equal(isGitPushViolation("git push --force-with-lease=refs/heads/x origin feature/x"), true)
  assert.equal(isGitPushViolation("git push origin +feature/x"), true)
  assert.equal(isGitPushViolation("git push origin x:main"), true)
  assert.equal(isGitPushViolation("git push origin x:refs/heads/main"), true)
  // Fast-forward pushes of the default branch (or a statically unresolvable HEAD).
  assert.equal(isGitPushViolation("git push origin main"), true)
  assert.equal(isGitPushViolation("git push origin master"), true)
  assert.equal(isGitPushViolation("git push origin refs/heads/main"), true)
  assert.equal(isGitPushViolation("git push origin HEAD"), true)
  assert.equal(isGitPushViolation("git push origin main:main"), true)
  assert.equal(isGitPushViolation("git -C /repo push origin main"), true)
})

test("isGitPushViolation allows a fast-forward push of an arbitrary head branch", () => {
  assert.equal(isGitPushViolation("git push origin feature/x"), false)
  assert.equal(isGitPushViolation("git push -u origin feature/x"), false) // f/d-free short flag stays allowed
  assert.equal(isGitPushViolation("git push origin pr-head-branch"), false)
  assert.equal(isGitPushViolation("git push origin feature/x:refs/heads/feature/x"), false)
  assert.equal(isGitPushViolation("git -C /repo push origin main-sitter/fix-1"), false)
  assert.equal(isGitPushViolation("git status"), false)
})

test("chained variants catch a mutation hidden behind an allowed read", () => {
  assert.equal(chainedGithubPrMutation("gh pr view 12 && gh api -X PUT repos/o/r/pulls/12/merge"), true)
  assert.equal(chainedGithubPrMutation("gh pr view 12 && gh pr comment 12 --body ok"), false)
  assert.equal(chainedGitPushViolation("git status && git push --force origin x"), true)
  assert.equal(chainedAdoWriteBackstopViolation(`curl -sS "${ADO_PRS}/1" && curl -X PATCH -d '{}' "${ADO_PRS}/1"`), true)
})

// --- az CLI write backstop (vectors shared with check-stage-guard.test.mjs) ---

test("isAdoAzWriteViolation allows reads, draft creation, and thread-resource invoke POSTs", () => {
  assert.equal(isAdoAzWriteViolation("az repos pr show --id 123"), false)
  assert.equal(isAdoAzWriteViolation("az repos pr list --source-branch feat/x --status active"), false)
  assert.equal(isAdoAzWriteViolation("az repos pr policy list --id 123"), false)
  assert.equal(isAdoAzWriteViolation("az pipelines runs list --branch main"), false)
  assert.equal(isAdoAzWriteViolation("az repos pr create --draft --source-branch feat/x --target-branch main --title t"), false)
  assert.equal(isAdoAzWriteViolation("az devops invoke --area git --resource pullRequestThreads --route-parameters project=p"), false)
  assert.equal(
    isAdoAzWriteViolation(
      "az devops invoke --area git --resource pullRequestThreadComments --route-parameters project=p --http-method POST --in-file reply.json",
    ),
    false,
  )
  assert.equal(isAdoAzWriteViolation("az devops invoke --area git --resource pullrequests --http-method POST --in-file pr.json"), false)
  assert.equal(isAdoAzWriteViolation("az account get-access-token"), false)
  assert.equal(isAdoAzWriteViolation("git status"), false)
})

test("isAdoAzWriteViolation blocks non-draft creation and every state mutation", () => {
  assert.equal(isAdoAzWriteViolation("az repos pr create --source-branch feat/x --target-branch main"), true)
  assert.equal(isAdoAzWriteViolation("az repos pr update --id 123 --status completed"), true)
  assert.equal(isAdoAzWriteViolation("az repos pr set-vote --id 123 --vote approve"), true)
  assert.equal(isAdoAzWriteViolation("az repos pr reviewer add --id 123 --reviewers a@b.c"), true)
  assert.equal(isAdoAzWriteViolation("az repos pr work-item add --id 123 --work-items 7"), true)
  assert.equal(isAdoAzWriteViolation("az pipelines run --name Nightly"), true)
  assert.equal(isAdoAzWriteViolation("az pipelines build queue --definition-id 3"), true)
  assert.equal(isAdoAzWriteViolation("az devops invoke --area git --resource pullrequests --http-method PATCH"), true)
  assert.equal(
    isAdoAzWriteViolation("az devops invoke --area git --resource pullRequestReviewers --http-method POST --in-file r.json"),
    true,
  )
  assert.equal(isAdoAzWriteViolation("az devops invoke --area build --resource builds --http-method POST"), true)
})

test("chainedAdoAzWriteViolation catches a mutation hidden behind an allowed segment", () => {
  assert.equal(chainedAdoAzWriteViolation("az repos pr show --id 1 && az repos pr set-vote --id 1 --vote approve"), true)
  assert.equal(chainedAdoAzWriteViolation("az repos pr show --id 1 && az repos pr list"), false)
})

test("isAdoMcpMutationTool blocks mutating ADO tool names and passes reads/creation/non-ADO servers", () => {
  assert.equal(isAdoMcpMutationTool("mcp__azure-devops__repo_update_pull_request"), true)
  assert.equal(isAdoMcpMutationTool("mcp__azure_devops__repo_complete_pull_request"), true)
  assert.equal(isAdoMcpMutationTool("mcp__ado__pr_set_vote"), true)
  assert.equal(isAdoMcpMutationTool("mcp__azure-devops__repo_get_pull_request"), false)
  assert.equal(isAdoMcpMutationTool("mcp__azure-devops__repo_create_pull_request"), false)
  assert.equal(isAdoMcpMutationTool("mcp__github__merge_pull_request"), false)
  assert.equal(isAdoMcpMutationTool("Bash"), false)
})
