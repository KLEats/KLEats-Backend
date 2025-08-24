const db = require('../../Config/mysqlDb');
const fs = require('fs');
const path = require('path');
const redis = require('../../Config/redisClint');
const getKeyRedis = require('../../Services/Helper/GetKeysRedis');

function ensureCanteenJson(canteen) {
  const filePath = path.join(__dirname, `../../Data/${canteen.CanteenId}.json`);
  if (fs.existsSync(filePath)) return filePath;

  const posterDefaultJpeg = `/images/canteens/${canteen.CanteenId}.jpeg`;
  const posterDefaultPng = `/images/canteens/${canteen.CanteenId}.png`;
  let poster = '';
  const absJpeg = path.join(__dirname, `../../public${posterDefaultJpeg}`);
  const absPng = path.join(__dirname, `../../public${posterDefaultPng}`);
  if (fs.existsSync(absJpeg)) poster = posterDefaultJpeg;
  else if (fs.existsSync(absPng)) poster = posterDefaultPng;

  const skeleton = {
    canteenId: canteen.CanteenId,
    CanteenName: canteen.CanteenName || '',
    Location: canteen.Location || '',
    fromTime: '',
    ToTime: '',
    accessTo: 'ALL',
    poster,
    item: {},
    category: []
  };
  fs.writeFileSync(filePath, JSON.stringify(skeleton, null, 4));
  return filePath;
}

async function createCanteen(req, res) {
  let conn;
  try {
    const { CanteenId, password, CanteenName, Location, fromTime = '', ToTime = '', accessTo = 'ALL', posterUrl = '' } = req.body;

    if (!CanteenId || !password || !CanteenName || !Location) {
      return res.status(400).json({ code: 0, message: 'CanteenId, password, CanteenName, Location are required' });
    }

    conn = await db.getConnection();
    await conn.query('INSERT INTO canteen (CanteenId, password, CanteenName, Location) VALUES (?, ?, ?, ?)', [CanteenId, password, CanteenName, Location]);

    // Handle poster upload
    let poster = posterUrl;
    if (req.files && req.files.poster) {
      const file = req.files.poster;
      const ext = path.extname(file.name) || '.jpeg';
      const rel = `/images/canteens/${CanteenId}${ext}`;
      const abs = path.join(__dirname, `../../public${rel}`);
      await file.mv(abs);
      poster = rel;
    }

    // Create JSON skeleton
    const filePath = path.join(__dirname, `../../Data/${CanteenId}.json`);
    const data = {
      canteenId: Number(CanteenId),
      CanteenName,
      Location,
      fromTime,
      ToTime,
      accessTo,
      poster,
      item: {},
      category: []
    };
    fs.writeFileSync(filePath, JSON.stringify(data, null, 4));

    // Invalidate caches
    await redis.del(getKeyRedis('canteens'));
    await redis.del(getKeyRedis('canteen', CanteenId));

    return res.json({ code: 1, message: 'Canteen created successfully', data: { CanteenId: Number(CanteenId), CanteenName, Location, fromTime, ToTime, accessTo, poster } });
  } catch (err) {
    console.error('createCanteen error:', err);
    if (conn) conn.release();
    // Handle duplicate key
    if (err && err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ code: 0, message: 'CanteenId already exists' });
    }
    return res.status(500).json({ code: -1, message: 'Internal Server Error' });
  } finally {
    if (conn) conn.release();
  }
}

async function updateCanteen(req, res) {
  let conn;
  try {
    const canteenId = req.params.id;
    if (!canteenId) return res.status(400).json({ code: 0, message: 'Canteen id required' });

    const upDb = {};
    const allowedDb = ['password', 'CanteenName', 'Location'];
    for (const k of allowedDb) if (req.body[k] !== undefined) upDb[k] = req.body[k];

    conn = await db.getConnection();
    if (Object.keys(upDb).length > 0) {
      const sets = Object.keys(upDb).map(k => `${k} = ?`).join(', ');
      const vals = Object.values(upDb);
      await conn.query(`UPDATE canteen SET ${sets} WHERE CanteenId = ?`, [...vals, canteenId]);
    }

    // Ensure JSON file exists and load it
    const jsonPath = ensureCanteenJson({ CanteenId: Number(canteenId) });
    const json = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

    // Update JSON-based fields
    const { fromTime, ToTime, accessTo, CanteenName, Location } = req.body;
    if (fromTime !== undefined) json.fromTime = fromTime;
    if (ToTime !== undefined) json.ToTime = ToTime;
    if (accessTo !== undefined) json.accessTo = accessTo;
    if (CanteenName !== undefined) json.CanteenName = CanteenName;
    if (Location !== undefined) json.Location = Location;

    // Poster update
    if (req.files && req.files.poster) {
      const file = req.files.poster;
      const ext = path.extname(file.name) || '.jpeg';
      const rel = `/images/canteens/${canteenId}${ext}`;
      const abs = path.join(__dirname, `../../public${rel}`);
      await file.mv(abs);
      json.poster = rel;
    }
    if (req.body.posterUrl) json.poster = req.body.posterUrl;

    fs.writeFileSync(jsonPath, JSON.stringify(json, null, 4));

    // Invalidate caches
    await redis.del(getKeyRedis('canteen', canteenId));
    await redis.del(getKeyRedis('canteens'));

    return res.json({ code: 1, message: 'Canteen updated successfully', data: json });
  } catch (err) {
    console.error('updateCanteen error:', err);
    if (conn) conn.release();
    return res.status(500).json({ code: -1, message: 'Internal Server Error' });
  } finally {
    if (conn) conn.release();
  }
}

async function getCanteen(req, res) {
  let conn;
  try {
    const canteenId = req.params.id;
    if (!canteenId) return res.status(400).json({ code: 0, message: 'Canteen id required' });

    conn = await db.getConnection();
    const [rows] = await conn.query('SELECT * FROM canteen WHERE CanteenId = ?', [canteenId]);
    if (rows.length === 0) return res.status(404).json({ code: 0, message: 'Canteen not found' });

    const jsonPath = ensureCanteenJson(rows[0]);
    const json = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

    return res.json({ code: 1, data: {
      CanteenName: json.CanteenName || rows[0].CanteenName,
      Location: json.Location || rows[0].Location,
      fromTime: json.fromTime || '',
      ToTime: json.ToTime || '',
      accessTo: json.accessTo || 'ALL',
      poster: json.poster || ''
    }});
  } catch (err) {
    console.error('getCanteen error:', err);
    if (conn) conn.release();
    return res.status(500).json({ code: -1, message: 'Internal Server Error' });
  } finally {
    if (conn) conn.release();
  }
}

async function listCanteens(req, res) {
  let conn;
  try {
    conn = await db.getConnection();
    const [rows] = await conn.query('SELECT CanteenId, CanteenName, Location FROM canteen');
    const results = rows.map(row => {
      const filePath = ensureCanteenJson(row);
      let json = {};
      try { json = JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch {}
      return {
        CanteenId: row.CanteenId,
        CanteenName: json.CanteenName || row.CanteenName || '',
        Location: json.Location || row.Location || '',
        fromTime: json.fromTime || '',
        ToTime: json.ToTime || '',
        accessTo: json.accessTo || 'ALL',
        poster: json.poster || ''
      };
    });
    return res.json({ code: 1, data: results });
  } catch (err) {
    console.error('listCanteens error:', err);
    if (conn) conn.release();
    return res.status(500).json({ code: -1, message: 'Internal Server Error' });
  } finally {
    if (conn) conn.release();
  }
}

//todo
async function deleteCanteen(req, res) {
  let conn;
  try {
    const canteenId = req.params.id;
    if (!canteenId) return res.status(400).json({ code: 0, message: 'Canteen id required' });

    // Load item IDs from index first to clean images and cache
    const indexPath = path.join(__dirname, '../../Data/itemsIndex.json');
    const canteenItemsPath = path.join(__dirname, '../../Data/canteenItems.json');
    const categoryAllPath = path.join(__dirname, '../../Data/category.json');
    let indexData = {};
    let canteenItems = {};
    let categoryAll = {};
    try { indexData = JSON.parse(fs.readFileSync(indexPath, 'utf8')); } catch {}
    try { canteenItems = JSON.parse(fs.readFileSync(canteenItemsPath, 'utf8')); } catch {}
    try { categoryAll = JSON.parse(fs.readFileSync(categoryAllPath, 'utf8')); } catch {}

    const itemIds = Object.keys(indexData)
      .filter(id => indexData[id] === `/Data/${canteenId}.json`)
      .map(id => Number(id));

    // Delete item images (try common extensions)
    for (const itemId of itemIds) {
      const base = path.join(__dirname, `../../public/images/items/${itemId}`);
      ['.jpg', '.jpeg', '.png'].forEach(ext => {
        const p = base + ext;
        if (fs.existsSync(p)) {
          try { fs.unlinkSync(p); } catch {}
        }
      });
      // Remove Redis cache per item
      try { redis.del(getKeyRedis('CanteenItem', itemId)); } catch {}
      // Remove index entry
      delete indexData[itemId];
    }

    // Remove canteenItems.json entry
    if (canteenItems[canteenId]) delete canteenItems[canteenId];

    // Remove canteenId from global categories
    if (categoryAll && categoryAll.Category) {
      for (const key of Object.keys(categoryAll.Category)) {
        const arr = categoryAll.Category[key].canteenId;
        if (Array.isArray(arr)) {
          categoryAll.Category[key].canteenId = arr.filter(id => id !== Number(canteenId));
        }
      }
    }

    // Persist updated data files
    try { fs.writeFileSync(indexPath, JSON.stringify(indexData, null, 4)); } catch {}
    try { fs.writeFileSync(canteenItemsPath, JSON.stringify(canteenItems, null, 4)); } catch {}
    try { if (categoryAll && Object.keys(categoryAll).length) fs.writeFileSync(categoryAllPath, JSON.stringify(categoryAll, null, 4)); } catch {}

    // Delete canteen JSON
    const canteenJsonPath = path.join(__dirname, `../../Data/${canteenId}.json`);
    if (fs.existsSync(canteenJsonPath)) {
      try { fs.unlinkSync(canteenJsonPath); } catch {}
    }

    // Delete poster image if exists
    const posterJpeg = path.join(__dirname, `../../public/images/canteens/${canteenId}.jpeg`);
    const posterJpg = path.join(__dirname, `../../public/images/canteens/${canteenId}.jpg`);
    const posterPng = path.join(__dirname, `../../public/images/canteens/${canteenId}.png`);
    [posterJpeg, posterJpg, posterPng].forEach(p => { if (fs.existsSync(p)) { try { fs.unlinkSync(p); } catch {} } });

    // Delete from MySQL last
    conn = await db.getConnection();
    await conn.query('DELETE FROM canteen WHERE CanteenId = ?', [canteenId]);
    conn.release();

    // Invalidate caches
    try { await redis.del(getKeyRedis('canteen', canteenId)); } catch {}
    try { await redis.del(getKeyRedis('canteens')); } catch {}

    return res.json({ code: 1, message: 'Canteen deleted successfully', data: { CanteenId: Number(canteenId), removedItems: itemIds.length } });
  } catch (err) {
    console.error('deleteCanteen error:', err);
    if (conn) conn.release();
    return res.status(500).json({ code: -1, message: 'Internal Server Error' });
  } finally {
    if (conn) conn.release();
  }
}

module.exports = { createCanteen, updateCanteen, getCanteen, listCanteens, deleteCanteen };
