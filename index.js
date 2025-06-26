const express = require("express");
const axios = require("axios");
const { GoogleSpreadsheet } = require("google-spreadsheet");
const creds = JSON.parse(process.env.CREDS_JSON);

const app = express();
app.use(express.json());

const VERIFY_TOKEN = "subesta2025";
const token = "EAAQNJ0oTVFABO4kxyzkqQDSNpicj8xNMWkOCJyz8R5pANQRMdJdhS0a9b6KaPMTmocGiYIFpYEZA4AwWfQeaBcPKTaqkzkux2uQSZBRolWJ3XHJZBbajz8sqQY8hPNIfV3M4a2GxsYKCmZCz94ZABNZCIFiqU93LGvUffTrrfARdZCbNYeKhnsrzikI2Dpi8ZA9rVAZDZD"; // 🔒 حدثي التوكن هنا
const phone_number_id = "741868625665520";
const sheetId = "1HMS3lcMRs6h_Xhr4Z73fQFbBiyzcZfIK06FIkK1cW0E";

let autoSendLink = true;

const userStates = {};
const districts = ["الاجاويد", "السلامه", "المطار", "الجميره"];
const services = ["كهرباء", "سباكه", "تكييف", "نجاره"];

const serviceLinks = {
  "الاجاويد-كهرباء": "https://wa.me/059689215",
  "السلامه-سباكه": "https://wa.me/059123456",
};

app.get("/", (req, res) => {
  const mode = req.query["hub.mode"];
  const verifyToken = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && verifyToken === VERIFY_TOKEN) {
    console.log("🟢 Webhook verified");
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

app.post("/", async (req, res) => {
  const message = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!message) return res.sendStatus(200);

  const from = message.from;

  const input =
    message?.text?.body?.trim() ||
    message?.interactive?.button_reply?.title?.trim() ||
    message?.interactive?.list_reply?.title?.trim();

  if (!input) return res.sendStatus(200);

  if (!userStates[from]) userStates[from] = { district: null, service: null };

  const state = userStates[from];

  if (!state.district) {
    if (districts.includes(input)) {
      state.district = input;
      await sendServiceList(from, services);
    } else {
      await sendTextMessage(from, "مرحبًا بك! اختر الحي الذي تسكن فيه:");
      await sendDistrictList(from, districts);
    }
    return res.sendStatus(200);
  }

  if (!state.service) {
    if (services.includes(input)) {
      state.service = input;

      const key = `${state.district}-${state.service}`;
      const technicianLink = serviceLinks[key] || "https://wa.me/0590000000";

      const reply = autoSendLink
        ? `📌 تم تسجيل طلبك:\nالحي: ${state.district}\nالخدمة: ${state.service}\n\nرابط الفني: ${technicianLink}`
        : `📌 تم تسجيل طلبك:\nالحي: ${state.district}\nالخدمة: ${state.service}\n\nسيتم التواصل معك قريبًا.`;

      await sendTextMessage(from, reply);
      await logRequestToSheet(from, state.district, state.service);
      delete userStates[from];
    } else {
      await sendServiceList(from, services);
    }
  }

  return res.sendStatus(200);
});

async function sendTextMessage(to, text) {
  try {
    await axios.post(
      `https://graph.facebook.com/v19.0/${phone_number_id}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        text: { body: text },
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("❌ Error sending text:", error.response?.data || error.message);
  }
}

async function sendDistrictList(to, items) {
  await sendListMessage(to, "اختر الحي", "يرجى اختيار حي من القائمة:", items, "الأحياء");
}

async function sendServiceList(to, items) {
  await sendListMessage(to, "اختر الخدمة", "يرجى اختيار نوع الخدمة:", items, "الخدمات");
}

async function sendListMessage(to, headerText, bodyText, itemTitles, sectionTitle) {
  const rows = itemTitles.map((title, i) => ({
    id: `${sectionTitle}_${i}`,
    title,
  }));

  try {
    await axios.post(
      `https://graph.facebook.com/v19.0/${phone_number_id}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        type: "interactive",
        interactive: {
          type: "list",
          header: { type: "text", text: headerText },
          body: { text: bodyText },
          action: {
            button: "عرض القائمة",
            sections: [{ title: sectionTitle, rows }],
          },
        },
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("❌ Error sending list:", error.response?.data || error.message);
  }
}

// ✅ تسجيل البيانات في Google Sheets باستخدام إصدار 3.3.0
async function logRequestToSheet(phone, district, service) {
  try {
    const doc = new GoogleSpreadsheet(sheetId);
    await doc.useServiceAccountAuth(creds);
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle["Requests"];
    await sheet.addRow({
      phone,
      district,
      service,
      date: new Date().toLocaleString("ar-EG"),
    });
    console.log("🟢 Logged to sheet");
  } catch (err) {
    console.error("❌ Google Sheet error:", err);
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Webhook server is running on port ${PORT}`);
});
