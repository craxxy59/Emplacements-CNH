const Appwrite = require('appwrite');

// Initialize Appwrite client
const client = new Appwrite.Client()
  .setEndpoint(process.env.APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1')
  .setProject(process.env.APPWRITE_PROJECT_ID || '');

const account = new Appwrite.Account(client);
const databases = new Appwrite.Databases(client);

// Configuration from environment variables
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID || 'cnh_db';
const BOATS_COLLECTION_ID = process.env.APPWRITE_COLLECTION_ID || 'boats_col';
const PROFILES_COLLECTION_ID = process.env.APPWRITE_PROFILES_COLLECTION_ID || 'profiles_col';

exports.handler = async (event, context) => {
  // Enable CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const { httpMethod, path, body } = event;
    const pathParts = path.split('/').filter(part => part !== '');
    const action = pathParts[pathParts.length - 1]; // Get the last part as action

    // Parse body if present
    const data = body ? JSON.parse(body) : {};

    // Route to appropriate handler
    let result;
    switch (action) {
      case 'signIn':
        result = await handleSignIn(data);
        break;
      case 'restoreSession':
        result = await handleRestoreSession();
        break;
      case 'signOut':
        result = await handleSignOut();
        break;
      case 'changePassword':
        result = await handleChangePassword(data);
        break;
      case 'fetchBoats':
        result = await handleFetchBoats();
        break;
      case 'upsertBoat':
        result = await handleUpsertBoat(data);
        break;
      case 'deleteBoat':
        result = await handleDeleteBoat(data);
        break;
      case 'fetchProfiles':
        result = await handleFetchProfiles();
        break;
      case 'updateProfile':
        result = await handleUpdateProfile(data);
        break;
      default:
        return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };
    }

    return { statusCode: 200, headers, body: JSON.stringify(result) };
  } catch (error) {
    console.error('Appwrite Proxy Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message || 'Internal server error' })
    };
  }
};

// Handler functions
async function handleSignIn(data) {
  const { email, password } = data;
  const session = await account.createEmailSession(email, password);

  // Fetch profile
  let profile;
  try {
    const response = await databases.listDocuments(DATABASE_ID, PROFILES_COLLECTION_ID, [
      Appwrite.Query.equal('email', email)
    ]);
    profile = response.documents[0] || { email, role: 'viewer' };
  } catch (e) {
    profile = { email, role: 'viewer' };
  }

  return {
    session: { access_token: session.accessToken, user: { id: session.userId, email: session.email } },
    profile: {
      id: profile.$id || profile.id,
      email: profile.email,
      full_name: profile.full_name || profile.name || profile.email,
      role: profile.role,
      must_change_password: profile.must_change_password || false
    }
  };
}

async function handleRestoreSession() {
  try {
    const user = await account.get();

    let profile;
    try {
      const response = await databases.listDocuments(DATABASE_ID, PROFILES_COLLECTION_ID, [
        Appwrite.Query.equal('email', user.email)
      ]);
      profile = response.documents[0] || { email: user.email, role: 'viewer' };
    } catch (e) {
      profile = { email: user.email, role: 'viewer' };
    }

    return {
      session: { user },
      profile: {
        id: profile.$id || profile.id,
        email: profile.email,
        full_name: profile.full_name || profile.name || profile.email,
        role: profile.role,
        must_change_password: profile.must_change_password || false
      }
    };
  } catch (e) {
    return null;
  }
}

async function handleSignOut() {
  await account.deleteSession('current');
  return { success: true };
}

async function handleChangePassword(data) {
  const { newPassword } = data;
  await account.updatePassword(newPassword);
  return { success: true };
}

async function handleFetchBoats() {
  const response = await databases.listDocuments(DATABASE_ID, BOATS_COLLECTION_ID);
  const boats = response.documents.map(doc => ({
    id: doc.$id,
    ...doc
  }));

  // Normalize boat data to match frontend expectations
  return boats.map(boat => ({
    id: boat.id,
    boat_name: boat.boat_name || '',
    licence_number: boat.licence_number || '',
    registration_number: boat.registration_number || '',
    boat_type: boat.boat_type || '',
    status: boat.status || 'actif',
    owner_name: boat.owner_name || '',
    owner_phone: boat.owner_phone || '',
    owner_email: boat.owner_email || '',
    emergency_contact: boat.emergency_contact || '',
    zone_id: boat.zone_id || 'A',
    slot_number: boat.slot_number || 1,
    length_m: boat.length_m || '',
    width_m: boat.width_m || '',
    equipment: boat.equipment || '',
    notes: boat.notes || '',
    photo_data: boat.photo_data || '',
    created_at: boat.created_at || new Date().toISOString(),
    updated_at: boat.updated_at || new Date().toISOString()
  }));
}

async function handleUpsertBoat(data) {
  const { id, ...boatData } = data;
  const payload = {
    ...boatData,
    updated_at: new Date().toISOString()
  };

  if (!id) {
    payload.created_at = new Date().toISOString();
    const response = await databases.createDocument(
      DATABASE_ID,
      BOATS_COLLECTION_ID,
      Appwrite.ID.unique(),
      payload
    );
    return { id: response.$id, ...response };
  } else {
    await databases.updateDocument(
      DATABASE_ID,
      BOATS_COLLECTION_ID,
      id,
      payload
    );
    return { id, ...payload };
  }
}

async function handleDeleteBoat(data) {
  const { boatId } = data;
  await databases.deleteDocument(DATABASE_ID, BOATS_COLLECTION_ID, boatId);
  return { success: true };
}

async function handleFetchProfiles() {
  const response = await databases.listDocuments(DATABASE_ID, PROFILES_COLLECTION_ID);
  const profiles = response.documents.map(doc => ({
    id: doc.$id,
    ...doc
  }));

  return profiles.map(profile => ({
    id: profile.id,
    email: profile.email,
    full_name: profile.full_name || profile.name || profile.email,
    role: profile.role,
    must_change_password: profile.must_change_password || false,
    created_at: profile.created_at || new Date().toISOString(),
    updated_at: profile.updated_at || new Date().toISOString()
  }));
}

async function handleUpdateProfile(data) {
  const { profileId, ...patch } = data;
  const updated = await databases.updateDocument(
    DATABASE_ID,
    PROFILES_COLLECTION_ID,
    profileId,
    { ...patch, updated_at: new Date().toISOString() }
  );

  return {
    id: updated.$id,
    email: updated.email,
    full_name: updated.full_name || updated.name || updated.email,
    role: updated.role,
    must_change_password: profile.must_change_password || false,
    created_at: updated.created_at || new Date().toISOString(),
    updated_at: updated.updated_at || new Date().toISOString()
  };
}