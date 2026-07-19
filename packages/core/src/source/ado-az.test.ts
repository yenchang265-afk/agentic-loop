import assert from "node:assert/strict"
import { test } from "node:test"
import { azInvokeArgs, azToHttp } from "./ado-az.js"

/**
 * The az-CLI data transport's pure pieces: the `az devops invoke` argv builder
 * (route/query params as separate k=v argv entries, GET by default) and the
 * adapter onto the HTTP-result shape the sources' parsers consume.
 */

test("azInvokeArgs builds a GET invoke with route and query parameters as separate argv entries", () => {
  const args = azInvokeArgs({
    area: "git",
    resource: "pullRequestThreads",
    organization: "https://dev.azure.com/acme",
    routeParameters: { project: "widgets", repositoryId: "repo-guid", pullRequestId: "7" },
    queryParameters: { "searchCriteria.status": "active" },
  })
  assert.deepEqual(args, [
    "devops",
    "invoke",
    "--area",
    "git",
    "--resource",
    "pullRequestThreads",
    "--organization",
    "https://dev.azure.com/acme",
    "--api-version",
    "7.1",
    "--output",
    "json",
    "--route-parameters",
    "project=widgets",
    "repositoryId=repo-guid",
    "pullRequestId=7",
    "--query-parameters",
    "searchCriteria.status=active",
  ])
})

test("azInvokeArgs omits empty parameter sets and appends an explicit method", () => {
  const args = azInvokeArgs({ area: "build", resource: "builds", organization: "https://dev.azure.com/acme", httpMethod: "GET" })
  assert.ok(!args.includes("--route-parameters"))
  assert.ok(!args.includes("--query-parameters"))
  assert.deepEqual(args.slice(-2), ["--http-method", "GET"])
})

test("azToHttp maps success to a 200-shaped result and failure to a non-ok one carrying stderr", () => {
  assert.deepEqual(azToHttp({ ok: true, statusText: "OK", body: '{"value":[]}' }), {
    ok: true,
    status: 200,
    statusText: "OK",
    body: '{"value":[]}',
  })
  assert.deepEqual(azToHttp({ ok: false, statusText: "ERROR: az login", body: "" }), {
    ok: false,
    status: 0,
    statusText: "ERROR: az login",
    body: "",
  })
})
