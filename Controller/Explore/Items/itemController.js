const db=require('../../../Config/mysqlDb.js');
const redis=require('../../../Config/redisClint');
//const client=redis.createClient();

const itemRepo=require('../../../Services/itemsServices/itemsCRUD.js');
const canteenHelper=require('../../../Services/Helper/GetCanteenId.js');
const getKeyRedis=require('../../../Services/Helper/GetKeysRedis.js');

const fs=require('fs').promises;
const path=require('path');
const { get } = require('express/lib/response.js');
const time=process.env.redis_time;

const canteensTIme=process.env.redis_time_canteens;
const itemTime=process.env.redis_time_item;
const categoryTime=process.env.redis_time_category;

function normString(s='') { return String(s || '').trim(); }

function isAvailableNow(item) {
  if (!item) return false;
  if (item.ava === false) return false;
  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = (item.startTime || '00:00').split(':').map(Number);
  const [eh, em] = (item.endTime || '23:59').split(':').map(Number);
  const start = (sh||0)*60 + (sm||0);
  const end = (eh||23)*60 + (em||59);
  // handle normal and overnight windows
  if (start <= end) return cur >= start && cur <= end;
  return cur >= start || cur <= end;
}

async function searchItems(req, res) {
  const q = normString(req.query.q || req.query.query || '');
  const canteenId = normString(req.query.canteen_id || '');
  const availableNow = String(req.query.available_now || 'false').toLowerCase() === 'true';
  const limit = Math.min(Math.max(parseInt(req.query.limit || '20', 10), 1), 50);
  const offset = Math.max(parseInt(req.query.offset || '0', 10), 0);

  if (!q || q.length < 2) {
    return res.json({ code: 0, message: 'Query too short. Provide at least 2 characters via ?q=' });
  }

  try {
    let canteenIds = [];
    if (canteenId) {
      const ids = await canteenHelper.getIds();
      if (!ids.includes(Number(canteenId))) {
        return res.json({ code: 0, message: 'Canteen not found.' });
      }
      canteenIds = [Number(canteenId)];
    } else {
      canteenIds = await canteenHelper.getIds();
    }

    const queryLower = q.toLowerCase();
    const results = [];

    for (const cid of canteenIds) {
      let data = null;
      try {
        data = await itemRepo.getCanteenDataById(cid);
      } catch (_) {}

      let itemsArr = [];
      if (data && data.item && typeof data.item === 'object') {
        itemsArr = Object.values(data.item || {});
      } else {
        // fallback: load IDs then fetch each item
        const ids = await itemRepo.getCanteenItemsIds(cid) || [];
        const fetched = await Promise.all(ids.map(id => itemRepo.getItemById(id)));
        itemsArr = fetched.filter(Boolean);
      }

      for (const it of itemsArr) {
        const name = (it.ItemName || '').toString();
        const tags = Array.isArray(it.tags) ? it.tags : [];
        const hay = name.toLowerCase();
        const tagHit = tags.some(t => (t || '').toString().toLowerCase().includes(queryLower));
        const match = hay.includes(queryLower) || tagHit;
        if (!match) continue;
        if (availableNow && !isAvailableNow(it)) continue;
        results.push({ ...it, canteenId: cid });
      }
    }

    // basic relevance: items with query at start come first
    results.sort((a, b) => {
      const aIdx = (a.ItemName || '').toLowerCase().indexOf(queryLower);
      const bIdx = (b.ItemName || '').toLowerCase().indexOf(queryLower);
      return (aIdx === -1 ? 9999 : aIdx) - (bIdx === -1 ? 9999 : bIdx);
    });

    const total = results.length;
    const sliced = results.slice(offset, offset + limit);
    return res.json({
      code: 1,
      message: 'Search results',
      data: sliced,
      meta: { query: q, canteenId: canteenId || null, availableNow, offset, limit, total, hasMore: offset + sliced.length < total }
    });
  } catch (err) {
    console.error('searchItems error:', err);
    return res.json({ code: -1, message: 'Internal Server Error.' });
  }
}

async function getItemsByCanteen(req,res) {
<<<<<<< HEAD
  const canteenId = req.query.canteen_id;
  const offset = Math.max(parseInt(req.query.offset || '0', 10), 0);
  const limit = Math.min(Math.max(parseInt(req.query.limit || '20', 10), 1), 50);
=======
  const canteenId=req.query.canteen_id;
  const offset=Number(req.query.offset);
  const limit=20;
>>>>>>> ce735365d6832a60de1ab0dcedab42e944a3684c

  if(!canteenId || isNaN(offset)){
    return res.json({code:0,message:'Invalid data.'});
  }

  try{
    const canteens=await canteenHelper.getIds();
    
    if(!canteens.includes(Number(canteenId))){
      return res.json({code:0,message:'Canteen not found.'});
    }

    const itemsList=await itemRepo.getCanteenItemsIds(canteenId);
    const paginatedItems = itemsList.slice(offset, offset + limit);
<<<<<<< HEAD
  const redisKeys = paginatedItems.map(id => getKeyRedis('CanteenItem', id));
  const cachedItems = redisKeys.length > 0 ? await redis.mget(redisKeys) : [];
=======
    const redisKeys = paginatedItems.map(id => getKeyRedis('CanteenItem',id));
    const cachedItems = redisKeys.length > 0 ? await redis.mget(...redisKeys) : [];
>>>>>>> ce735365d6832a60de1ab0dcedab42e944a3684c

    let data = [];

    for (let i = 0; i < paginatedItems.length; i++) {
      let cacheItem = cachedItems[i] ? JSON.parse(cachedItems[i]) : null;

      if (!cacheItem) {
        cacheItem = await itemRepo.getItemById(paginatedItems[i]);

<<<<<<< HEAD
        if (!cacheItem || cacheItem.ava === false) {
=======
        if (!cacheItem || !cacheItem.ava) {
>>>>>>> ce735365d6832a60de1ab0dcedab42e944a3684c
          continue;
        }

        await redis.setex(getKeyRedis('CanteenItem',paginatedItems[i]), itemTime, JSON.stringify(cacheItem));
      }

<<<<<<< HEAD
      // Do not filter by time window here; include items with ava=true regardless of current time
=======
      if (isAvailableNow(cacheItem) === false) {
        continue;
      }
>>>>>>> ce735365d6832a60de1ab0dcedab42e944a3684c

      data.push(cacheItem);
    }

    const total = itemsList.length;
    const hasMore = offset + limit < total;
    return res.json({
      code: 1,
      message: "Data fetched Successfully.",
      data: data,
      meta: {
        offset,
<<<<<<< HEAD
  limit,
=======
        limit,
>>>>>>> ce735365d6832a60de1ab0dcedab42e944a3684c
        total,
        hasMore
      }
    });


  }catch(err){
    console.log(err);
    return res.json({code:-1,message:'Internal server error.'});
  }
}

async function getItemById(req,res) {

  const itemId=req.query.item_id;
  
  if(!itemId){
    return res.json({code:0,message:'Item id not provided.'});
  }

  try{
    let cacheItem = await redis.get(getKeyRedis('CanteenItem',itemId));

    if(cacheItem){
      cacheItem=JSON.parse(cacheItem);
    }else{
      cacheItem=await itemRepo.getItemById(itemId);

      if(cacheItem==null){
        return res.json({code:0,message:'Item not found.'});
      }

      await redis.setex(getKeyRedis('CanteenItem',itemId), itemTime, JSON.stringify(cacheItem));

      if(cacheItem.ava==false){
        return res.json({code:0,message:'Item not available.'});
      }
    }

    if(isAvailableNow(cacheItem)==false){
      return res.status(400).json({ code: 0, message: `Item only available between ${cacheItem.startTime || "00:00"} - ${cacheItem.endTime || "23:59"}.`,data:cacheItem });
    }

    // const now = new Date();
    // const currentTime = now.getHours() * 60 + now.getMinutes();

    // const [startHour, startMin] = (cacheItem.startTime || "00:00").split(":").map(Number);
    // const [endHour, endMin] = (cacheItem.endTime || "23:59").split(":").map(Number);
    // const startTime = startHour * 60 + startMin;
    // const endTime = endHour * 60 + endMin;

    // if (currentTime < startTime || currentTime > endTime) {
    //     return res.json({ code: 0, message: `Item only available between ${cacheItem.startTime || "00:00"} - ${cacheItem.endTime || "23:59"}.`,data:cacheItem });
    // }

    return res.json({code:1,message:'Item fetched Successfully.',data:cacheItem});

  }catch(err){
    console.log(err);
    return res.status(500).json({code:-1,message:'Internal Server error.'});
  }
}

async function getItemsByCategory(req, res) {
  const categoryName = req.params.category_name;

  if (!categoryName) {
    return res.json({ code: 0, message: 'Category name is required.' });
  }

  try {
    let cacheCategory = await redis.get(getKeyRedis('category', categoryName));

    if (cacheCategory) {
      cacheCategory = JSON.parse(cacheCategory);
    } else {
      cacheCategory = await itemRepo.getItemIdsByCategory(categoryName);
      if (!cacheCategory) {
        return res.json({ code: 0, message: 'Category not found.' });
      }
      await redis.setex(
        getKeyRedis('category', categoryName),
        categoryTime,
        JSON.stringify(cacheCategory)
      );
    }

    const itemKeys = cacheCategory.items.map(id => getKeyRedis('CanteenItem', id));
    const cachedItems = await redis.mget(itemKeys);

    let items = [];
    const missingIds = [];

    cachedItems.forEach((val, index) => {
      if (val) {
        items.push(JSON.parse(val));
      } else {
        missingIds.push(cacheCategory.items[index]);
      }
    });

    if (missingIds.length) {
      const fetchedItems = await Promise.all(
        missingIds.map(id => itemRepo.getItemById(id))
      );

      await Promise.all(
        fetchedItems.map((item, idx) => {
          if (!item) return null;
          items.push(item);
          return redis.setex(
            getKeyRedis('CanteenItem', missingIds[idx]),
            itemTime,
            JSON.stringify(item)
          );
        })
      );
    }

  // Return items with ava=true, regardless of current time windows
  items = items.filter(item => item && item.ava !== false);

    return res.json({ code: 1, message: 'Items fetched successfully.', data: items });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ code: -1, message: 'Internal Server Error.' });
  }
}

async function getPopularItems(req, res) {
  let conn;
  try {
    // Helper: seconds until next local midnight
    const secondsUntilMidnight = () => {
      const now = new Date();
      const next = new Date(now);
      next.setHours(24, 0, 0, 0);
      return Math.max(1, Math.floor((next - now) / 1000));
    };

    // Daily cache key based on local date
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const dailyKey = `popular_items:${yyyy}${mm}${dd}`;
    const dailyFullKey = `popular_items_full:${yyyy}${mm}${dd}`;

    // Return fully cached hydrated list if present
    try {
      const full = await redis.get(dailyFullKey);
      if (full) {
        return res.json({ code: 1, message: "Popular items fetched successfully", data: JSON.parse(full) });
      }
    } catch (_) {}

    // Serve from cache if present (cache only stores ranking metadata, not full item objects)
    try {
      const cached = await redis.get(dailyKey);
      if (cached) {
        const ranked = JSON.parse(cached); // [{itemId,totalQuantity,orderCount}]
        const items = [];
        const chosenIds = new Set();

        // hydrate items and apply availability filters
        for (const row of ranked) {
          const redisKey = getKeyRedis('CanteenItem', row.itemId);
          let cacheItem = await redis.get(redisKey);
          cacheItem = cacheItem ? JSON.parse(cacheItem) : await itemRepo.getItemById(row.itemId);
          if (!cacheItem) continue;
          if (cacheItem.ava === false) continue;
          if (!isAvailableNow(cacheItem)) continue;
          items.push({ ...row, item: cacheItem });
          chosenIds.add(Number(row.itemId));
          if (items.length >= 3) break;
        }

        // backfill if needed
        if (items.length < 3) {
          try {
            const need = 3 - items.length;
            const canteenIds = await canteenHelper.getIds();
            let candidateIds = [];
            for (const cid of canteenIds) {
              try {
                const ids = await itemRepo.getCanteenItemsIds(cid);
                if (Array.isArray(ids) && ids.length) candidateIds.push(...ids);
              } catch (_) {}
            }
            candidateIds = [...new Set(candidateIds.map(Number))].filter(id => !chosenIds.has(id));
            for (let i = candidateIds.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [candidateIds[i], candidateIds[j]] = [candidateIds[j], candidateIds[i]];
            }
            for (const id of candidateIds) {
              if (items.length >= 3) break;
              const rkey = getKeyRedis('CanteenItem', id);
              let it = await redis.get(rkey);
              it = it ? JSON.parse(it) : await itemRepo.getItemById(id);
              if (!it) continue;
              if (it.ava === false) continue;
              if (!isAvailableNow(it)) continue;
              await redis.setex(rkey, itemTime, JSON.stringify(it)).catch(() => {});
              items.push({ itemId: id, totalQuantity: 0, orderCount: 0, item: it });
            }
          } catch (_) {}
        }

  // cache the full hydrated list for the rest of the day
  try { await redis.setex(dailyFullKey, secondsUntilMidnight(), JSON.stringify(items)); } catch (_) {}
  return res.json({ code: 1, message: "Popular items fetched successfully", data: items });
      }
    } catch (_) {}

    conn = await db.getConnection();

    let query = `
      SELECT jt.itemId, 
             SUM(jt.quantity) AS totalQuantity, 
             COUNT(*) AS orderCount
      FROM orders o
      JOIN JSON_TABLE(
          o.items,
          '$[*]' COLUMNS (
              itemId INT PATH '$.itemId',
              quantity INT PATH '$.quantity'
          )
      ) jt ON 1=1
      WHERE o.status = 'order_confirmed'
        AND o.orderTime >= NOW() - INTERVAL 1 DAY
      GROUP BY jt.itemId
      ORDER BY totalQuantity DESC
      LIMIT 10
    `;

  const [rows] = await conn.query(query);

  // Cache minimal ranking (no embedded item objects)
  const ranking = rows.map(r => ({ itemId: Number(r.itemId), totalQuantity: Number(r.totalQuantity || 0), orderCount: Number(r.orderCount || 0) }));

  const items = [];
  const chosenIds = new Set();

  // Hydrate items from ranking
  for (const row of ranking) {
      //console.log('Processing popular item:', row.itemId, 'Total Quantity:', row.totalQuantity);
      const redisKey = getKeyRedis('CanteenItem', row.itemId);
      let cacheItem = await redis.get(redisKey);

      if (cacheItem) {
        cacheItem = JSON.parse(cacheItem);
      } else {
        cacheItem = await itemRepo.getItemById(row.itemId);

        if (!cacheItem) {
          continue;
        }

        await redis.setex(redisKey, itemTime, JSON.stringify(cacheItem));
      }

      if(cacheItem.ava === false) {
        continue;
      }

      if(!isAvailableNow(cacheItem)) {
        continue;
      }

      items.push({
        ...row,
        item: cacheItem
      });
      chosenIds.add(Number(row.itemId));

      if(items.length>=3){
        break;
      }
    }

    // If fewer than 3 popular items, backfill with random available items
    if (items.length < 3) {
      try {
        const need = 3 - items.length;
        const canteenIds = await canteenHelper.getIds();

        // Gather a pool of candidate item IDs across canteens
        let candidateIds = [];
        for (const cid of canteenIds) {
          try {
            const ids = await itemRepo.getCanteenItemsIds(cid);
            if (Array.isArray(ids) && ids.length) {
              candidateIds.push(...ids);
            }
          } catch (_) {}
        }

        // De-dup and exclude already chosen
        candidateIds = [...new Set(candidateIds.map(Number))].filter(id => !chosenIds.has(Number(id)));

        // Shuffle candidates (Fisher–Yates)
        for (let i = candidateIds.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [candidateIds[i], candidateIds[j]] = [candidateIds[j], candidateIds[i]];
        }

        const backfill = [];
        for (const id of candidateIds) {
          if (backfill.length >= need) break;
          const rkey = getKeyRedis('CanteenItem', id);
          let it = await redis.get(rkey);
          it = it ? JSON.parse(it) : await itemRepo.getItemById(id);
          if (!it) continue;
          if (it.ava === false) continue;
          if (!isAvailableNow(it)) continue;
          // Cache miss populate
          await redis.setex(rkey, itemTime, JSON.stringify(it)).catch(() => {});
          backfill.push({ itemId: id, totalQuantity: 0, orderCount: 0, item: it });
        }

        items.push(...backfill.slice(0, need));
      } catch (e) {
        // non-fatal; proceed with what we have
      }
    }

    // Cache the ranking (without item payloads) for the rest of the day
    try {
      await redis.setex(dailyKey, secondsUntilMidnight(), JSON.stringify(ranking));
    } catch (_) {}

    // Cache full hydrated list as well
    try {
      await redis.setex(dailyFullKey, secondsUntilMidnight(), JSON.stringify(items));
    } catch (_) {}

    return res.json({
      code: 1,
      message: "Popular items fetched successfully",
      data: items
    });

  } catch (err) {
    console.log("getPopularItems error:", err.message);
    return res.json({
      code: -1,
      message: err.message || "Internal Server error"
    });
  } finally {
    if (conn) conn.release();
  }
}



// Return ALL items for a specific canteen and category, including unavailable items.
// Optional query: ?only_unavailable=true to filter only non-available ones.
async function getItemsByCategoryForCanteenAll(req, res) {
  const canteenId = req.params.canteen_id;
  const categoryName = req.params.category_name;
  const onlyUnavailable = String(req.query.only_unavailable || 'false').toLowerCase() === 'true';

  if (!canteenId || !categoryName) {
    return res.json({ code: 0, message: 'canteen_id and category_name are required.' });
  }

  try {
    const canteens = await canteenHelper.getIds();
    if (!canteens.includes(Number(canteenId))) {
      return res.json({ code: 0, message: 'Canteen not found.' });
    }

    let items = await itemRepo.getItemsByCategory(Number(canteenId), categoryName);
    if (!Array.isArray(items)) items = [];
    items = items.map(it => ({ ...it, canteenId: it.canteenId ?? Number(canteenId) }));

    if (onlyUnavailable) {
      items = items.filter(it => it && it.ava === false);
    }

    return res.json({ code: 1, message: 'Items fetched successfully.', data: items, meta: { canteenId: Number(canteenId), categoryName, onlyUnavailable, total: items.length } });
  } catch (err) {
    console.error('getItemsByCategoryForCanteenAll error:', err);
    return res.status(500).json({ code: -1, message: 'Internal Server Error.' });
  }
}

module.exports={
  getItemsByCanteen,
  getItemById,
  getItemsByCategory,
  getItemsByCategoryForCanteenAll,
  searchItems,
  getPopularItems,
}