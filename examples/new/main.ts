import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

const app = new Hono();

// Schema for greeting endpoint (tests peer dependencies)
const greetSchema = z.object({
  name: z.string().min(1),
});

app.get("/", (c) => {
  return c.json({
    message: "Hello from deno2nix!",
    runtime: "Deno",
    framework: "Hono (npm package)",
  });
});

// Endpoint with zod validation (peer dep test)
app.post("/greet", zValidator("json", greetSchema), (c) => {
  const { name } = c.req.valid("json");
  return c.json({ message: `Hello, ${name}!` });
});

app.get("/health", (c) => {
  return c.text("OK");
});

const port = parseInt(Deno.env.get("PORT") || "8000");
console.log(`Server running on http://localhost:${port}`);
Deno.serve({ port }, app.fetch);
