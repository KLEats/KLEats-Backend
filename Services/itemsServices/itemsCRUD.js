const res = require('express/lib/response');
const itemRepo=require('./itemsLogics');
const fs = require('fs');
const path = require('path');

async function addItem(params,image) {
    //const {canteenId,FoodItemName,Description,Price,AvailableFrom,AvailableTo,Quantity,availability,tags}=params;
    const {ItemName,Description="",Price,ava=true,canteenId,tags=[],category}=params;

    let startTime = '';
    let endTime = '';

    try{
        
        let loadData=await itemRepo.loadCanteenItems(canteenId);

        const itemId=await itemRepo.generateIdForItem();

        if (!loadData.item) {
            loadData.item = {};
        }

        const imageExtension = image.name.split('.').pop();
        await image.mv(`public/images/items/${itemId}.${imageExtension}`);

        if (category && loadData.category) {
            const catObj = loadData.category.find(cat => cat.name && cat.name.toLowerCase() === category.toLowerCase());
            if (catObj) {
                startTime = catObj.startTime || '';
                endTime = catObj.endTime || '';

                loadData.item[itemId]={
                    ItemId:itemId,
                    ItemName,
                    tags,
                    Description,
                    Price,
                    ava,
                    ImagePath:`/images/items/${itemId}.${imageExtension}`,
                    category,
                    startTime,
                    endTime
                };

                if (!Array.isArray(catObj.items)) {
                    catObj.items = [];
                }
                catObj.items.push(itemId);

                itemRepo.saveCanteenData(loadData,canteenId,itemId);

                // Return the newly added item
                return loadData.item[itemId];
            }
        }

        throw new Error('Category not found');
    
    }catch(err){
        throw err;
    }
}

async function deleteItem(canteenId,ItemId) {
    try{
        await itemRepo.deleteItemWithItemId(canteenId,ItemId);
    }catch(err){
        throw err;
    }
}

async function updateItem(canteenId,ItemId,image,newData) {

    try{
        await itemRepo.updateData(canteenId,ItemId,image,newData);
        
        return await module.exports.getItemById(ItemId);
    }catch(err){
        throw err;
    }
    
}

async function getItemById(ItemId) {
    try{
        return await itemRepo.loadItemById(ItemId);
    }catch(err){
        throw err;
    }
    
}

// Fetch multiple items by their IDs. Returns an array of item objects.
async function getItemsByIds(itemIds = []) {
    try {
        if (!Array.isArray(itemIds) || itemIds.length === 0) return [];
        const unique = [...new Set(itemIds.filter(Boolean))];
        const results = await Promise.all(unique.map(id => itemRepo.loadItemById(id)));
        return results.filter(Boolean);
    } catch (err) {
        throw err;
    }
}

async function getCanteenDataById(canteenId) {
    try{
        return await itemRepo.loadCanteenDataById(canteenId);
    }catch(err){
        throw err;
    }
}

async function getCanteenItemsIds(canteenId) {

    try{
        const list=itemRepo.loadCanteenItemsList();

        if(!list[canteenId]){
            return null;
        }

        return list[canteenId];
    }catch(err){
        throw err;
    }
    
}

async function addCategory(canteenId,category) {
    try {
        return await itemRepo.addCategory(canteenId,category);
    } catch (err) {
        throw err;
    }
}

async function getItemsByCategory(canteenId, categoryName) {
    try {
        return await itemRepo.getItemsByCategory(canteenId, categoryName);
    } catch (err) {
        throw err;
    }
}

async function editCategoryCanteen(canteenId, categoryName, newData) {
    try {
        return await itemRepo.editCategoryCanteen(canteenId, categoryName, newData);
    } catch (err) {
        throw err;
    }
}

async function getCategoryCanteen(canteenId) {
    try {
        return await itemRepo.getCategoryCanteen(canteenId);
    } catch (err) {
        throw err;
    }
}

async function getAllCategoriesForCanteen(canteenId) {

    try{
        return await itemRepo.getAllCategoriesForCanteen(canteenId);
    }catch(err){
        throw err;
    }
    
}

async function getAllCategories() {
    try {
        let categories = await itemRepo.getCategoryAll();

        categories = categories
            .filter(cat => cat.canteenId.length > 0) 
            .map(cat => ({
                name: cat.name,
                poster: cat.poster
            }));

        console.log("Filtered Categories:", categories);
        return categories;
    } catch (err) {
        throw err;
    }
}

async function getItemIdsByCategory(categoryName) {
    try {
        let categories=await itemRepo.getCategoryAll();

        const category = categories.find(
            cat => cat.name.toLowerCase() === categoryName.toLowerCase()
        );

        const result=[];

        for(let i=0;i<category.canteenId.length;i++){
            result.push(...await itemRepo.getItemIdsByCategoryInCanteen(category.canteenId[i],categoryName));
        }

        category.items = result;

        console.log("Category found:", result);

        return category;
    } catch (err) {
        throw err;
    }
}

async function getCategoriesByCanteenId(canteenId) {
    try {
        const categories = await itemRepo.getCategoryCanteen(canteenId);

        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();

        const filteredCategories = categories
            .filter(cat => {
                
                if (cat.no_of_items <= 0) return false;

               
                if (!cat.isAvalable) return false;

                
                if (cat.startTime && cat.endTime) {
                    const [startH, startM] = cat.startTime.split(":").map(Number);
                    const [endH, endM] = cat.endTime.split(":").map(Number);

                    const startMinutes = startH * 60 + startM;
                    const endMinutes = endH * 60 + endM;

                    if (startMinutes < endMinutes) {
                        
                        if (currentMinutes < startMinutes || currentMinutes > endMinutes) {
                            return false;
                        }
                    } else if (startMinutes > endMinutes) {
                        
                        if (currentMinutes < startMinutes && currentMinutes > endMinutes) {
                            return false;
                        }
                    }
                }

                return true;
            })
            .map(cat => ({
                name: cat.name,
                no_of_items: cat.no_of_items,
                poster: cat.poster,
                startTime: cat.startTime,
                endTime: cat.endTime
            }));

        return filteredCategories;

    } catch (err) {
        throw err;
    }
}

async function addCategoryInGlobal(categoryData,image) {
    try {
        await itemRepo.addCategoryInGlobal(categoryData,image);
        return categoryData;
    } catch (err) {
        throw err;
    }
}

async function updateCategoryInGlobal(category_name,image){
    try{
        return await itemRepo.updateCategoryImageInGlobal(category_name,image);
    }catch(err){
        throw err;
    }
}

async function getAllCategoriesGlobal() {
    try {
        return await itemRepo.getCategoryAll();
    } catch (err) {
        throw err;
    }
}

module.exports={
    addItem,
    deleteItem,
    updateItem,
    getItemById,
    getItemsByIds,
    getCanteenDataById,
    getCanteenItemsIds,
    addCategory,
    getItemsByCategory,
    editCategoryCanteen,
    getCategoryCanteen,
    getAllCategoriesForCanteen,
    getAllCategories,
    getItemIdsByCategory,
    getCategoriesByCanteenId,
    addCategoryInGlobal,
    updateCategoryInGlobal,
    getAllCategoriesGlobal
}