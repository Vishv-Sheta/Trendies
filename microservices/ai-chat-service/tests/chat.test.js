const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

process.env.NODE_ENV = "test";
process.env.PORT = "5099";
const { app } = require("../server");
const { getStoreInfo } = require("../services/storeInfoService");

let testServer;
let baseUrl;

test.before(async () => {
  await new Promise((resolve) => {
    testServer = app.listen(5099, () => {
      baseUrl = "http://localhost:5099";
      resolve();
    });
  });
});

test.after(async () => {
  await new Promise((resolve) => {
    testServer.close(resolve);
  });
});

test("GET /health returns status 200 with service metadata", async () => {
  const res = await fetch(`${baseUrl}/health`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, "ok");
  assert.equal(data.service, "ai-chat-service");
});

test("POST /chat validates empty or missing message", async () => {
  const resEmpty = await fetch(`${baseUrl}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "   " }),
  });
  assert.equal(resEmpty.status, 400);
  const dataEmpty = await resEmpty.json();
  assert.equal(dataEmpty.success, false);

  const resMissing = await fetch(`${baseUrl}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(resMissing.status, 400);
});

test("POST /chat rejects messages exceeding 500 characters", async () => {
  const longMsg = "a".repeat(501);
  const res = await fetch(`${baseUrl}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: longMsg }),
  });
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.match(data.message, /too long/i);
});

test("storeInfoService responds with store policy details", () => {
  const res = getStoreInfo("What is your return policy?");
  assert.ok(res.message);
  assert.match(res.message, /return|refund/i);
});
