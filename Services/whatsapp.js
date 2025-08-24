const axios = require("axios");

async function sendOrder(admins, orderPayload) {
    const token = process.env.WHATSAPP_TOKEN;
    const Phone_Number = process.env.PHONE_NUMBER_ID;
    const API_URL = `https://graph.facebook.com/v19.0/${Phone_Number}/messages`;
    const failed = [];

    for (const admin of admins) {
        const messageTemplate = {
            messaging_product: "whatsapp",
            to: admin,
            type: "template",
            template: {
                name: process.env.TEMPLATE_NAME,
                language: { code: "en_US" },
                components: [
                    {
                        type: "body",
                        parameters: [
                            { type: "text", text: orderPayload.orderId },
                            { type: "text", text: orderPayload.name },
                            { type: "text", text: orderPayload.rollNo },
                            { type: "text", text: orderPayload.items },
                            { type: "text", text: orderPayload.total.toString() },
                            { type: "text", text: orderPayload.time },
                            {type:"text",text: orderPayload.type},
                        ],
                    },
                ],
            },
        };

        try {
            await axios.post(API_URL, messageTemplate, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
            });
            console.log(` Sent to ${admin}`);
        } catch (err) {
            console.error(` Failed to send to ${admin}`, err.response?.data || err.message);
            failed.push(admin);
        }
    }

    if (failed.length > 0) {
        throw new Error(`Failed to send messages to: ${failed.join(", ")}`);
    }
}

module.exports = { sendOrder };
