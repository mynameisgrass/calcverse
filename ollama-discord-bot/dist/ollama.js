import axios from "axios";
const host = (process.env.OLLAMA_HOST || "http://localhost:11434").replace(/\/$/, "");
const model = process.env.OLLAMA_MODEL || "dolphin3:8b";
const googleKey = process.env.GOOGLE_API_KEY;
const googleModel = process.env.GOOGLE_MODEL || "gemini-1.5-flash-latest";
const googleBase = (process.env.GOOGLE_BASE || "https://generativelanguage.googleapis.com").replace(/\/$/, "");
const chatTimeout = Number(process.env.CHAT_TIMEOUT_MS || 120000);
export async function chatModel(prompt) {
    // Prefer Google first when key is provided.
    if (googleKey) {
        try {
            const response = await axios.post(`${googleBase}/v1beta/models/${googleModel}:generateContent?key=${encodeURIComponent(googleKey)}`, {
                contents: [
                    {
                        role: "user",
                        parts: [{ text: prompt }],
                    },
                ],
            }, { timeout: chatTimeout });
            const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text ||
                response.data?.candidates?.[0]?.content?.parts?.map((p) => p?.text).filter(Boolean).join("\n");
            if (typeof text === "string" && text.trim().length > 0) {
                return text.trim();
            }
            return JSON.stringify(response.data, null, 2);
        }
        catch (err) {
            const detail = err?.response?.data || err?.message || err;
            console.error("Google chat failed", detail);
            throw new Error(typeof detail === "string"
                ? `Google chat failed: ${detail}`
                : `Google chat failed; see server logs`);
        }
    }
    // Fallback to local Ollama
    const url = `${host}/api/chat`;
    try {
        const response = await axios.post(url, {
            model,
            messages: [{ role: "user", content: prompt }],
            stream: false,
        }, { timeout: chatTimeout });
        const content = response.data?.message?.content;
        if (typeof content === "string" && content.trim().length > 0) {
            return content.trim();
        }
        return JSON.stringify(response.data, null, 2);
    }
    catch (err) {
        const msg = err?.response?.data?.error || err?.message || "Ollama request failed";
        throw new Error(msg);
    }
}
//# sourceMappingURL=ollama.js.map