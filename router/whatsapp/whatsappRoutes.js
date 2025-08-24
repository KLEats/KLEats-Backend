const express = require("express");
const router = express.Router();
const { sendOrder } = require("../../Services/whatsapp.js");

router.get("/send", (req, res) => {
   const VERIFY_TOKEN = process.env.VERIFY_TOKEN; 

  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token) {
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("WEBHOOK_VERIFIED");
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  }
  res.send("Use POST method to send WhatsApp order to admins.");
});

router.post("/send", async (req, res) => {
    try {
        const { admins, orderPayload } = req.body;

        if (!admins || !orderPayload) {
            return res.status(400).json({ code: 0, message: "Missing admins or orderPayload" });
        }

        await sendOrder(admins, orderPayload);
        return res.json({ code: 1, message: "Messages sent successfully" });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ code: 0, message: "Failed to send messages", error: err.message });
    }
});



module.exports = router;
