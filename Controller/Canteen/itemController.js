const { measureMemory } = require("vm");
const db = require("../../Config/mysqlDb.js");
const { checkIsAdmin } = require("./helper");
const fs = require('fs');
const path = require('path');
const { json } = require("body-parser");
const itemRepo = require('../../Services/itemsServices/itemsCRUD.js');
const redis = require('../../Config/redisClint');
const getKeyRedis = require('../../Services/Helper/GetKeysRedis');

async function CanteengetItems(req, res) {
  try {
    const CanteenId = req.payload.CanteenId;

    if (!req.payload.role === 'admin') {
      return res.json({ code: -1, message: 'Invalid Token.' });
    }



    // const query='select * from FoodItem where CanteenId= ?';
    // const conn=await db.getConnection();

    // await conn.query(query,[CanteenId]).then(result=>{
    //   conn.release();
    //   result=result[0];

    //   if(!result || result.length==0){
    //     return res.json({code:1,message:"Items fetched Successfully",data:[]});
    //   }


    //   for(let i=0;i<result.length;i++){
    //     result[i].images=[];
    //     try{
    //         const directoryPath = path.join(__dirname, "../../public/images/canteens/"+CanteenId+"/foodImages/"+result[i].FoodItemId+"/");

    //         const files = fs.readdirSync(directoryPath);
    //         files.forEach(file => {
    //           result[i].images.push(file);
    //           console.log(file);
    //         });

    //       }catch(err){
    //         console.log(err.message);
    //         return res.json({code:0,message:"Unable to fetch item images."});
    //       }

    //   }

    //   return res.json({
    //     code:1,
    //     message:"Items fetched Successfully",
    //     data:result,
    //   })

    // }).catch((err)=>{
    //   conn.release();
    //   console.log("itemController->getItems err: "+err.message);
    //   return res.json({
    //     code:0,
    //     message:"Unable to fetch data."
    //   });
    // });
  } catch (err) {
    console.log("Failed to get items: " + err.message);
    return res.json({ code: -1, message: "Failed to get items" });
  }
}

//todo
async function deleteItem(req, res) {

  try {
    const itemId = req.query.id;
    const CanteenId = req.payload.CanteenId;
    //console.log(CanteenId);

    const conn = await db.getConnection();
    const query = 'delete from FoodItem where FoodItemId=? and CanteenId=?';

    await conn.query(query, [itemId, CanteenId]).then((result) => {
      conn.release();

      if (result[0].affectedRows > 0) {

        const dir = path.join(__dirname, "../../public/images/canteens/" + CanteenId + "/foodImages/" + itemId + "/");

        try {
          fs.rmSync(dir, { recursive: true, force: true });
          console.log(`Folder for FoodItemId ${itemId} deleted successfully.`);
        } catch (err) {
          console.error("Error deleting FoodItemId folder: ", err.message);
        }

        return res.json({
          code: 1,
          message: 'Item removed.'
        });
      } else {
        return res.json({
          code: 0,
          message: 'Item not removed.'
        })
      }
    }).catch(err => {
      conn.release();
      console.log(err.message);
      return res.json({
        code: 0,
        message: 'Unable to delete.'
      })
    });
  } catch (err) {
    console.log(err.message);
    return res.json({
      code: -1,
      message: 'Something wrong'
    })
  }
}

async function updateItemData(req, res) {
  const itemId = req.query.id;
  if (!itemId) {
    return res.json({ code: 0, message: 'Please provide itemId.' });
  }

  const CanteenId = req.payload.CanteenId;

  let images = null;
  let jsonData = null;

  try {
    if (req.files && req.files.images) {
      images = req.files.images;

      if (!Array.isArray(images)) {
        images = [images];
      }

      const isValid = images.every(img =>
        ['image/png', 'image/jpeg', 'image/webp'].includes(img.mimetype)
      );

      if (!isValid) {
        return res.json({ code: 0, message: 'Only PNG, JPEG, or WEBP images are accepted.' });
      }
    }

    if (req.body.json) {
      try {
        jsonData = JSON.parse(req.body.json);
      } catch (err) {
        return res.json({ code: 0, message: 'Invalid JSON format.' });
      }
    }

    if (!jsonData && !images) {
      return res.json({ code: 0, message: 'Nothing to update (no data or images provided).' });
    }

    const firstImage = Array.isArray(images) && images.length > 0 ? images[0] : null;
    const updatedItem = await itemRepo.updateItem(CanteenId, itemId, firstImage, jsonData);

    // Remove Redis cache for this item if present
    await redis.del(getKeyRedis('CanteenItem', itemId));

    return res.json({ code: 1, message: 'Updated Successfully.', data: updatedItem });
  } catch (err) {
    // Check for item not found error
    if (err.message && err.message.startsWith('Item ID')) {
      return res.status(404).json({ code: 0, message: err.message });
    }
    // Other errors
    console.error(err);
    return res.status(500).json({ code: -1, message: 'Internal server error.' });
  }
}


async function updateItemImages(req, res) {

  try {
    let newImages = [];
    let removedImages = [];
    const CanteenId = req.payload.CanteenId;
    const itemId = req.query.id;

    try {
      newImages = req.files.new_images;

      if (!Array.isArray(newImages)) {
        newImages = [newImages];
      }

      if (!newImages || newImages.length == 0) {
        throw new Error("no new images provided.");
      }

      for (let i = 0; i < newImages.length; i++) {
        if (!(newImages[i].mimetype == 'image/png' || newImages[i].mimetype == 'image/jpeg')) {
          throw new Error("file format not accesspted.");
        }
      }

    } catch (err) {
      newImages = [];
      console.log(err.message);
    }

    try {
      removedImages = JSON.parse(req.body.removed_images);
      removedImages = removedImages.images;

      if (!Array.isArray(removedImages)) {
        removedImages = [removedImages];
      }
    } catch (err) {
      removedImages = [];
      console.log(err.message);
    }

    if (newImages.length == 0 && removedImages.length == 0) {
      return res.json({ code: 0, message: "no images provided." });
    }

    if (newImages.length != 0) {
      for (let i = 0; i < newImages.length; i++) {
        await newImages[i].mv('public/images/canteens/' + CanteenId + '/foodImages/' + itemId + '/' + newImages[i].name);
      }
    }

    if (removedImages.length != 0) {

      let cou = 0;
      try {
        const directoryPath = path.join(__dirname, "../../public/images/canteens/" + CanteenId + "/foodImages/" + itemId + "/");

        const files = fs.readdirSync(directoryPath);
        cou = files.length;

      } catch (err) {
        console.log(err.message);
        return res.json({ code: 0, message: "Unable to delete items." });
      }

      if (cou == 0) {
        return res.json({ code: 0, message: "Images are not there for this item." });
      } else if (removedImages.length == cou) {
        return res.json({ code: 0, message: "Can not remove all the images." });
      }

      for (let i = 0; i < removedImages.length; i++) {
        try {
          fs.rmSync('public/images/canteens/' + CanteenId + '/foodImages/' + itemId + '/' + removedImages[i]);
        } catch (err) {
          console.log(err.message);
        }
      }
    }

    return res.json({ code: 1, message: "Updates on Images executed." });

  } catch (err) {
    console.log(err);
    return res / json({ code: -1, message: err.message });
  }
}

async function addItem(req, res) {

  try {

    const CanteenId = req.payload.CanteenId;
    let images, jsonData;
    try {
      images = req.files.images;

      if (!Array.isArray(images)) {
        images = [images];
      }

      if (!images || images.length == 0) {
        throw new Error("no images provided.");
      }

      if (!(images[0].mimetype == 'image/png' || images[0].mimetype == 'image/jpeg' || images[0].mimetype == 'image/webp')) {
        throw new Error("file format not accesspted.");
      }

      if(images[0].size>50*1024){
        throw new Error("Image size should be less than 50KB.");
      }

    } catch (err) {
      console.log(err);
      return res.json({ code: 0, message: err.message });
    }

    try {
      jsonData = JSON.parse(req.body.json);
    } catch (err) {
      console.log(err.message);
      return res.json({ code: 0, message: err.message });
    }

    jsonData.canteenId = CanteenId;
    const newItem = await itemRepo.addItem(jsonData, images[0]);

    return res.json({ code: 1, message: "Item Added", data: newItem });

  } catch (err) {
    console.log(err);
    return res.json({ code: -1, message: 'Not able to add Item.' });
  }

}

async function addCategory(req, res) {
  try {
    const CanteenId = req.payload.CanteenId;

    if (!req.payload.role === 'admin') {
      return res.json({ code: -1, message: 'Invalid Token.' });
    }

    const { category } = req.body;

    await itemRepo.addCategory(CanteenId, category);
    await redis.del('explore:categories:available:' + CanteenId);

    return res.json({ code: 1, message: 'Category added successfully' });

  } catch (err) {
    console.log("addCategory error:", err.message);
    return res.json({ code: -1, message: err.message || 'Internal Server error' });
  }
}

async function editCategory(req, res) {
  try {
    const CanteenId = req.payload.CanteenId;
    if (!req.payload.role === 'admin') {
      return res.json({ code: -1, message: 'Invalid Token.' });
    }
    const { categoryName, newData } = req.body;
    if (!categoryName || typeof categoryName !== 'string' || categoryName.trim() === '') {
      return res.json({ code: 0, message: 'Original category name is required and must be a non-empty string' });
    }
    if (!newData || typeof newData !== 'object') {
      return res.json({ code: 0, message: 'newData must be an object with fields to update' });
    }
    const result = await itemRepo.editCategoryCanteen(CanteenId, categoryName, newData);
    await redis.del('explore:categories:available:' + CanteenId);
    return res.json({ code: 1, message: 'Category updated successfully', data: result });
  } catch (err) {
    console.log('editCategory error:', err.message);
    return res.json({ code: -1, message: err.message || 'Internal Server error' });
  }
}

async function getCategoryCanteen(req, res) {
  try {
    const CanteenId = req.payload.CanteenId;
    const result = await itemRepo.getCategoryCanteen(CanteenId);
    return res.json({ code: 1, data: result });
  } catch (err) {
    console.log('getCategoryCanteen error:', err.message);
    return res.json({ code: -1, message: err.message || 'Internal Server error' });
  }
}

async function getItemsByCategory(req, res) {
  try {
    const CanteenId = req.payload.CanteenId;
    // Accept categoryName from query or body
    const categoryName = req.query.categoryName || req.body.categoryName;
    if (!categoryName || typeof categoryName !== 'string' || categoryName.trim() === '') {
      return res.json({ code: 0, message: 'Category name is required and must be a non-empty string' });
    }
    const items = await itemRepo.getItemsByCategory(CanteenId, categoryName);
    return res.json({ code: 1, data: items });
  } catch (err) {
    console.log('getItemsByCategory error:', err.message);
    return res.json({ code: -1, message: err.message || 'Internal Server error' });
  }
}

async function getCategoryAll(req, res) {
  try {
    const CanteenId = req.payload.CanteenId;
    const categories = await itemRepo.getAllCategoriesForCanteen(CanteenId);

    return res.json({ code: 1, data: categories });
  } catch (err) {
    console.log('getCategoryAll error:', err.message);
    return res.json({ code: -1, message: err.message || 'Internal Server error' })
  }
}


module.exports = {
  CanteengetItems,
  deleteItem,
  updateItemData,
  addItem,
  updateItemImages,
  addCategory,
  editCategory,
  getCategoryCanteen,
  getItemsByCategory,
  getCategoryAll,
}