import { Hono } from "hono";

const app = new Hono();

app.get("/", (c) => {
  return c.json({
    message: "Hello from deno2nix!",
    runtime: "Deno",
    framework: "Hono (npm package)",
  });
});

app.get("/health", (c) => {
  return c.text("OK");
});

const port = parseInt(Deno.env.get("PORT") || "8000");
console.log(`Server running on http://localhost:${port}`);
Deno.serve({ port }, app.fetch);
