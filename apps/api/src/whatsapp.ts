import { config } from "./config.js";

// Sends one approved WhatsApp template message through the Meta Cloud API.
// The template must already be approved in Meta Business Manager; the text is
// passed as its single body variable ({{1}}).
export const whatsappConfigured = () =>
  Boolean(config.WHATSAPP_PHONE_NUMBER_ID && config.WHATSAPP_ACCESS_TOKEN);

export async function sendWhatsAppTemplate(input: {
  to: string;
  template: string;
  language: string;
  text: string;
  // A media id from uploadWhatsAppMedia; sent as the template's image header.
  imageId?: string;
}): Promise<{ id: string }> {
  const response = await fetch(
    `https://graph.facebook.com/${config.WHATSAPP_API_VERSION}/${config.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: input.to,
        type: "template",
        template: {
          name: input.template,
          language: { code: input.language },
          components: [
            ...(input.imageId
              ? [
                  {
                    type: "header",
                    parameters: [{ type: "image", image: { id: input.imageId } }],
                  },
                ]
              : []),
            {
              type: "body",
              parameters: [{ type: "text", text: input.text }],
            },
          ],
        },
      }),
      signal: AbortSignal.timeout(15000),
    },
  );
  const payload: any = await response.json().catch(() => ({}));
  const id = payload?.messages?.[0]?.id;
  if (!response.ok || !id)
    throw new Error(
      payload?.error?.message || `WhatsApp API responded ${response.status}`,
    );
  return { id };
}

// Uploads one image to WhatsApp once, so every recipient of a broadcast reuses the same media id.
export async function uploadWhatsAppMedia(
  buffer: Buffer,
  mimeType: string,
  filename: string,
): Promise<{ id: string }> {
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", mimeType);
  form.append("file", new Blob([new Uint8Array(buffer)], { type: mimeType }), filename);
  const response = await fetch(
    `https://graph.facebook.com/${config.WHATSAPP_API_VERSION}/${config.WHATSAPP_PHONE_NUMBER_ID}/media`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${config.WHATSAPP_ACCESS_TOKEN}` },
      body: form,
      signal: AbortSignal.timeout(30000),
    },
  );
  const payload: any = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.id)
    throw new Error(
      payload?.error?.message || `WhatsApp media upload responded ${response.status}`,
    );
  return { id: String(payload.id) };
}
