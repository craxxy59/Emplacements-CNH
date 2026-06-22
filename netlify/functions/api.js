const { getStore } = require("@netlify/blobs");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json",
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "" };
  }

  try {
    const store = getStore("cnh-data");
    const action = event.path.split("/").pop();

    let raw = await store.get("data.json");
    let data = raw ? JSON.parse(raw) : { boats: [] };

    let result;

    switch (action) {
      case "fetchBoats":
        result = { boats: data.boats || [] };
        break;

      case "upsertBoat": {
        const body = JSON.parse(event.body || "{}");
        const boat = body.boat || body;
        if (!boat || !boat.id) throw new Error("Bateau invalide (id requis)");

        const idx = data.boats.findIndex((b) => b.id === boat.id);
        if (idx >= 0) {
          data.boats[idx] = boat;
        } else {
          data.boats.push(boat);
        }
        await store.set("data.json", JSON.stringify(data, null, 2));
        result = { boat };
        break;
      }

      case "deleteBoat": {
        const body = JSON.parse(event.body || "{}");
        const { boatId } = body;
        data.boats = data.boats.filter((b) => b.id !== boatId);
        await store.set("data.json", JSON.stringify(data, null, 2));
        result = { success: true };
        break;
      }

      case "fetchProfiles":
        result = { profiles: [] };
        break;

      default:
        return {
          statusCode: 404,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: "Route inconnue: " + action }),
        };
    }

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify(result),
    };
  } catch (err) {
    console.error("API Error:", err);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: err.message || "Erreur interne" }),
    };
  }
};
