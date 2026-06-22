const REPO_OWNER = "craxxy59";
const REPO_NAME = "Emplacements-CNH";
const FILE_PATH = "data.json";
const BRANCH = "main";

const HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json",
};

async function readData() {
  const url = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${BRANCH}/${FILE_PATH}`;
  const res = await fetch(url);
  if (!res.ok) return { boats: [] };
  return await res.json();
}

async function writeData(data, token) {
  const apiUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}`;
  
  // Get current SHA
  const getRes = await fetch(apiUrl, {
    headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github.v3+json" }
  });
  if (!getRes.ok) throw new Error("GitHub: impossible de lire le fichier");
  const fileInfo = await getRes.json();
  
  // Update file
  const content = Buffer.from(JSON.stringify(data, null, 2)).toString("base64");
  const putRes = await fetch(apiUrl, {
    method: "PUT",
    headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github.v3+json" },
    body: JSON.stringify({
      message: "Mise à jour data.json depuis l'app",
      content: content,
      sha: fileInfo.sha,
      branch: BRANCH
    })
  });
  if (!putRes.ok) throw new Error("GitHub: impossible d'écrire");
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: HEADERS, body: "" };
  }

  const action = event.path.split("/").pop();
  const token = process.env.GITHUB_TOKEN;

  try {
    switch (action) {
      case "fetchBoats": {
        const data = await readData();
        return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ boats: data.boats || [] }) };
      }

      case "upsertBoat": {
        if (!token) throw new Error("GITHUB_TOKEN non configuré");
        const body = JSON.parse(event.body || "{}");
        const boat = body.boat || body;
        if (!boat || !boat.id) throw new Error("Bateau invalide");
        
        const data = await readData();
        const idx = data.boats.findIndex(function(b) { return b.id === boat.id; });
        if (idx >= 0) data.boats[idx] = boat;
        else data.boats.push(boat);
        
        await writeData(data, token);
        return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ boat: boat }) };
      }

      case "deleteBoat": {
        if (!token) throw new Error("GITHUB_TOKEN non configuré");
        const body = JSON.parse(event.body || "{}");
        const data = await readData();
        data.boats = data.boats.filter(function(b) { return b.id !== body.boatId; });
        await writeData(data, token);
        return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ success: true }) };
      }

      case "fetchProfiles":
        return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ profiles: [] }) };

      default:
        return { statusCode: 404, headers: HEADERS, body: JSON.stringify({ error: "Route inconnue" }) };
    }
  } catch (err) {
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};