const db=require('../../../Config/mysqlDb')
const redis=require('../../../Config/redisClint');

const itemsCRUD=require('../../../Services/itemsServices/itemsCRUD');

const canteenHelper=require('../../../Services/Helper/GetCanteenId');
const getKeyRedis=require('../../../Services/Helper/GetKeysRedis');

const canteenTime=process.env.redis_time_canteen;
const canteensTIme=process.env.redis_time_canteens;
const itemTime=process.env.redis_time_item;
const categoryTime=process.env.redis_time_category;
const EXPLORE_CATEGORIES_TTL = Number(process.env.redis_time_explore_categories || 90);

function isAvailableNow(item) {
  if (!item) return false;
  if (item.ava === false) return false;
  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = (item.startTime || '00:00').split(':').map(Number);
  const [eh, em] = (item.endTime || '23:59').split(':').map(Number);
  const start = (sh||0)*60 + (sm||0);
  const end = (eh||23)*60 + (em||59);
  if (start <= end) return cur >= start && cur <= end;
  return cur >= start || cur <= end; // overnight window
}

async function getCanteens(req,res) {
  try{
    const canteens=await canteenHelper.getIds();
    let canteenPromises = canteens.map(async (cid) => {
      let canteen = await redis.get(getKeyRedis('canteen',cid));
      if (canteen) {
        return JSON.parse(canteen);
      } else {
        canteen = await itemsCRUD.getCanteenDataById(cid);
        await redis.setex(getKeyRedis('canteen',cid), canteenTime, JSON.stringify(canteen));
        return canteen;
      }
    });
    let data = await Promise.all(canteenPromises);
    return res.json({code:1,message:'Canteens Fetched Successfully',data});
  }catch(err){
    console.log(err);
    return res.json({code:-1,message:'Internal Server Error.'});
  }
}

async function getCanteenById(req,res) {

  const canteenId=req.params.canteen_id;

  if(!canteenId){
    return res.json({code:0,message:'Canteen Id is required.'});
  }

  try{
    const canteens=await canteenHelper.getIds();

    if(!canteens.includes(Number(canteenId))){
      return res.json({code:0,message:'Canteen not found.'});
    }

    let canteen = await redis.get(getKeyRedis('canteen',canteenId));
    if (canteen) {
      canteen=JSON.parse(canteen);
    } else {
      canteen = await itemsCRUD.getCanteenDataById(canteenId);
      await redis.setex(getKeyRedis('canteen',canteenId), canteenTime, JSON.stringify(canteen));
      canteen=canteen;
    }

    return res.json({code:1,message:'Canteen data fetched Successfully.',data:canteen});

  }catch(err){
    console.log(err);
    return res.json({code:-1,message:'Internal Server error.'});
  }
}

async function getAllCategories(req, res) {
  try {
    // short-lived cache for final filtered categories list
    const cacheKey = 'explore:categories:available';
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return res.json({ code: 1, message: 'Categories fetched successfully.', data: JSON.parse(cached) });
      }
    } catch (_) {}

    const categories = await itemsCRUD.getAllCategories(); // [{name, poster}]

    const filtered = [];
    for (const cat of categories) {
      try {
        // Load aggregated item IDs for this category (cached)
        let cacheCategory = await redis.get(getKeyRedis('category', cat.name));
        if (cacheCategory) {
          cacheCategory = JSON.parse(cacheCategory);
        } else {
          cacheCategory = await itemsCRUD.getItemIdsByCategory(cat.name);
          if (cacheCategory) {
            await redis.setex(
              getKeyRedis('category', cat.name),
              categoryTime,
              JSON.stringify(cacheCategory)
            ).catch(() => {});
          }
        }

        if (!cacheCategory || !Array.isArray(cacheCategory.items) || cacheCategory.items.length === 0) {
          continue;
        }

        // Try to find at least one currently available item in this category
        const itemKeys = cacheCategory.items.map(id => getKeyRedis('CanteenItem', id));
        const cachedItems = await redis.mget(itemKeys);

        let hasAvailable = false;
        const missingIds = [];
    cachedItems.forEach((val, idx) => {
          if (val) {
            try {
              const it = JSON.parse(val);
      if (!hasAvailable && it && it.ava !== false) {
                hasAvailable = true;
              }
            } catch (_) {}
          } else {
            missingIds.push(cacheCategory.items[idx]);
          }
        });

    if (!hasAvailable && missingIds.length) {
          const fetched = await Promise.all(missingIds.map(id => itemsCRUD.getItemById(id)));
          for (let i = 0; i < fetched.length; i++) {
            const it = fetched[i];
            if (!it) continue;
            await redis.setex(getKeyRedis('CanteenItem', missingIds[i]), itemTime, JSON.stringify(it)).catch(() => {});
      if (it.ava !== false) {
              hasAvailable = true;
              break;
            }
          }
        }

        if (hasAvailable) {
          filtered.push({ name: cat.name, poster: cat.poster });
        }
      } catch (e) {
        // Skip category on error, continue with others
      }
    }

  // store result with a short TTL to reduce load
  try { await redis.setex(cacheKey, EXPLORE_CATEGORIES_TTL, JSON.stringify(filtered)); } catch (_) {}

  return res.json({ code: 1, message: 'Categories fetched successfully.', data: filtered });
  } catch (err) {
    console.log(err);
    return res.json({ code: -1, message: 'Internal Server Error.' });
  }
}

async function getCanteenCategories(req, res) {
  const canteenId = req.params.canteen_id;

  if (!canteenId) {
    return res.json({ code: 0, message: 'Canteen Id is required.' });
  }

  try {
    // Short-lived cache for final filtered list
    const categoriesCacheKey = `explore:categories:available:${canteenId}`;
    try {
      const cached = await redis.get(categoriesCacheKey);
      if (cached) {
        return res.json({ code: 1, message: 'Categories fetched successfully.', data: JSON.parse(cached) });
      }
    } catch (_) {}

    // Fetch all categories for canteen (no time-based filtering)
  const categories = await itemsCRUD.getCategoryCanteen(canteenId);

    // categories come with: { name, no_of_items, poster, startTime, endTime }
    const filtered = [];
    for (const cat of categories) {
      try {
        const itemIds = await require('../../../Services/itemsServices/itemsLogics').getItemIdsByCategoryInCanteen(Number(canteenId), cat.name);
        if (!Array.isArray(itemIds) || itemIds.length === 0) continue;

        const itemKeys = itemIds.map(id => getKeyRedis('CanteenItem', id));
        const cachedItems = await redis.mget(itemKeys);
        let hasAvailable = false;
        const missing = [];
        cachedItems.forEach((val, idx) => {
          if (val) {
            try {
              const it = JSON.parse(val);
              if (!hasAvailable && it && it.ava !== false) hasAvailable = true;
            } catch (_) {}
          } else {
            missing.push(itemIds[idx]);
          }
        });
        if (!hasAvailable && missing.length) {
          const fetched = await Promise.all(missing.map(id => itemsCRUD.getItemById(id)));
          for (let i = 0; i < fetched.length; i++) {
            const it = fetched[i];
            if (!it) continue;
            await redis.setex(getKeyRedis('CanteenItem', missing[i]), itemTime, JSON.stringify(it)).catch(() => {});
            if (it.ava !== false) { hasAvailable = true; break; }
          }
        }
        if (hasAvailable) {
          filtered.push(cat);
        }
      } catch (_) {}
    }

  try { await redis.setex(categoriesCacheKey, EXPLORE_CATEGORIES_TTL, JSON.stringify(filtered)); } catch (_) {}

  return res.json({ code: 1, message: 'Categories fetched successfully.', data: filtered });
  } catch (err) {
    console.log(err);
    return res.json({ code: -1, message: 'Internal Server Error.' });
  }
}

module.exports={
  getCanteens,
  getCanteenById,
  getAllCategories,
  getCanteenCategories
}