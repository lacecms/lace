import { laceImageConfig } from "@lacecms/astro";
import { defineConfig } from "astro/config";

export default defineConfig({ image: laceImageConfig(process.env), output: "static" });
