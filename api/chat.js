export default async function handler(req, res) {
    if (req.method !== "POST") {
        res.status(200).json({ response: assistantMessage.content });

    }

    const { message } = req.body;

    try {
        console.log("🔹 Creando un nuevo hilo en OpenAI...");
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // ⏳ Esperar hasta 30s antes de cancelar

        // 🔹 1️⃣ Crear un nuevo Thread (hilo)
        const threadResponse = await fetch("https://api.openai.com/v1/threads", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
                "Content-Type": "application/json",
                "OpenAI-Beta": "assistants=v2"
            },
            signal: controller.signal // 🔹 Si OpenAI tarda más de 30s, se cancela la solicitud
        });

        clearTimeout(timeoutId); // ✅ Cancelar el timeout si OpenAI responde antes
        const threadData = await threadResponse.json();
        if (!threadResponse.ok) {
            console.error("❌ Error al crear el hilo:", threadData);
            return res.status(threadResponse.status).json({ error: threadData });
        }

        const threadId = threadData.id;
        console.log(`✅ Hilo creado con ID: ${threadId}`);

        // 🔹 2️⃣ Agregar el mensaje del usuario al hilo
        console.log("🔹 Añadiendo el mensaje del usuario...");
        const messageResponse = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
                "Content-Type": "application/json",
                "OpenAI-Beta": "assistants=v2"
            },
            body: JSON.stringify({ role: "user", content: message })
        });

        const messageData = await messageResponse.json();
        if (!messageResponse.ok) {
            console.error("❌ Error al añadir mensaje:", messageData);
            return res.status(messageResponse.status).json({ error: messageData });
        }

        console.log("✅ Mensaje añadido correctamente");

        // 🔹 3️⃣ Ejecutar el asistente en el hilo
        console.log("🔹 Ejecutando el asistente...");
       const runResponse = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs`, {
    method: "POST",
    headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
        "OpenAI-Beta": "assistants=v2"
    },
    body: JSON.stringify({
        assistant_id: process.env.OPENAI_ASSISTANT_ID
    })
});


        const runData = await runResponse.json();
        if (!runResponse.ok) {
            console.error("❌ Error al ejecutar el asistente:", runData);
            return res.status(runResponse.status).json({ error: runData });
        }

        const runId = runData.id;
        console.log(`✅ Asistente ejecutado con ID: ${runId}`);

        // 🔹 4️⃣ Esperar hasta que el asistente termine la ejecución (máx. 30s)
        console.log("🔹 Esperando la respuesta del asistente...");
        let status = "in_progress";
        let attempts = 0;

        while (status === "in_progress" || status === "queued") {
            if (attempts >= 15) { // 🔹 No esperar más de 30 segundos
                console.error("⏳ Timeout: OpenAI sigue en progreso");
                return res.status(504).json({ error: "El asistente está tardando demasiado. Inténtalo de nuevo en unos segundos." });
            }

            await new Promise((resolve) => setTimeout(resolve, 2000)); // 🔹 Esperar 2 segundos antes de preguntar de nuevo
            attempts++;

            const checkRunResponse = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs/${runId}`, {
                method: "GET",
                headers: {
                    "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
                    "OpenAI-Beta": "assistants=v2"
                }
            });

            const checkRunData = await checkRunResponse.json();
            if (!checkRunResponse.ok) {
                console.error("❌ Error al verificar el estado:", checkRunData);
                return res.status(checkRunResponse.status).json({ error: checkRunData });
            }

            status = checkRunData.status;
        }

        console.log("✅ Asistente ha completado la ejecución");

        // 🔹 5️⃣ Obtener la respuesta final del asistente
        console.log("🔹 Obteniendo la respuesta...");
        const messagesResponse = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
                "OpenAI-Beta": "assistants=v2"
            }
        });

        const messagesData = await messagesResponse.json();
        if (!messagesResponse.ok) {
            console.error("❌ Error al obtener la respuesta:", messagesData);
            return res.status(messagesResponse.status).json({ error: messagesData });
        }

        // 🔹 Capturar correctamente la respuesta del asistente
        const assistantMessage = messagesData.data.find((msg) => msg.role === "assistant");
        if (!assistantMessage || !assistantMessage.content) {
            console.error("❌ OpenAI no devolvió ninguna respuesta.");
            return res.status(500).json({ response: "El asistente no proporcionó una respuesta válida." });
        }

        console.log("✅ Respuesta recibida:", assistantMessage.content);
        res.status(200).json({ response: assistantMessage.content });

    } catch (error) {
        console.error("❌ Error inesperado en la API:", error);

        if (error.name === "AbortError") {
            res.status(504).json({ error: "Tiempo de espera agotado. Inténtalo de nuevo más tarde." });
        } else {
            res.status(500).json({ error: "Error en la solicitud a OpenAI" });
        }
    }
}
