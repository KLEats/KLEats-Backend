const fs = require('fs');
const path = require('path');

const indexFile = path.join(__dirname, "../../Data/itemsIndex.json");
const canteensItemsListFile = path.join(__dirname, "../../Data/canteenItems.json");
const categoryAllFile = path.join(__dirname, "../../Data/category.json");
const redis = require('../../Config/redisClint');
const getKeyRedis = require('../Helper/GetKeysRedis');

function loadIndex() {
    try {
        if (!fs.existsSync(indexFile)) {
            throw new Error("Index file not found.");
        }
        const data = fs.readFileSync(indexFile, "utf8");
        return JSON.parse(data);
    } catch (err) {
        console.error("Error loading index file:", err.message);
        throw new Error("Failed to load index file.");
    }
}

function loadItemPath(ItemId) {
    try {
        const data = loadIndex();

        if (!data[ItemId]) {
            //throw new Error(`Item ID ${ItemId} not found in index.`);
            return null;
        }

        return path.join(__dirname, '..', '..', data[ItemId]);
    } catch (err) {
        throw err;
    }
}

function saveIndex(data) {
    try {
        fs.writeFileSync(indexFile, JSON.stringify(data, null, 4));
    } catch (err) {
        throw err;
    }
}

let maxIdCache = null;
let lastLoadedTime = 0;
const CACHE_EXPIRY = 5 * 60 * 1000;

function generateIdForItem() {
    try {
        const currentTime = Date.now();

        if (maxIdCache !== null && (currentTime - lastLoadedTime) < CACHE_EXPIRY) {
            return ++maxIdCache;
        }

        const indexData = loadIndex();
        const keys = Object.keys(indexData).map(Number);

        maxIdCache = keys.length > 0 ? Math.max(...keys) : 0;
        lastLoadedTime = currentTime;

        return ++maxIdCache;
    } catch (err) {
        throw err;
    }
}

function loadCanteenItemsList() {
    try {
        if (!fs.existsSync(canteensItemsListFile)) {
            throw new Error("Canteen Item List not found.");
        }
        const data = fs.readFileSync(canteensItemsListFile, "utf8");
        return JSON.parse(data);
    } catch (err) {
        console.error("Error loading canteenItemList file:", err.message);
        throw new Error("Failed to load canteenItemList file.");
    }
}

function saveCanteenItemList(data) {
    try {
        fs.writeFileSync(canteensItemsListFile, JSON.stringify(data, null, 4));
    } catch (err) {
        throw err;
    }
}

function saveCanteenData(data, canteenId, itemId) {
    try {
        const filePath = path.join(__dirname, `../../Data/${canteenId}.json`);
        fs.writeFileSync(filePath, JSON.stringify(data, null, 4));

        const indexData = loadIndex();
        let canteenList = loadCanteenItemsList();

        if (!canteenList[canteenId]) {
            canteenList[canteenId] = [];
        }

        if (!canteenList[canteenId].includes(itemId)) {
            canteenList[canteenId].push(itemId);
        }

        indexData[itemId] = `/Data/${canteenId}.json`;
        saveIndex(indexData);
        saveCanteenItemList(canteenList);
    } catch (err) {
        throw err;
    }
}

function loadCanteenItems(canteen = null, fileDir = null) {
    try {
        const filePath = fileDir
            ? (path.isAbsolute(fileDir) ? fileDir : path.join(__dirname, fileDir))
            : path.join(__dirname, `../../Data/${canteen}.json`);
        if (!fs.existsSync(filePath)) {
            // If canteen JSON not found, return a minimal object; caller may enrich
            return {
                canteenId: canteen ? Number(canteen) : undefined,
                CanteenName: '',
                Location: '',
                fromTime: '',
                ToTime: '',
                accessTo: 'ALL',
                poster: '',
                item: {},
                category: []
            };
        }
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        console.error('Error loading canteen data:', err.message);
        throw err;
    }
}

async function deleteItemWithItemId(canteenId, ItemId) {
    try {
        let data = await loadCanteenItems(canteenId);

        if (!data.item || !data.item[ItemId]) {
            throw new Error(`Item ID ${ItemId} not found in cantcanteenIdeen ${canteenId}`);
        }

        delete data.item[ItemId];

        saveCanteenData(data, canteenId);

        let indexData = loadIndex();
        delete indexData[ItemId];

        saveIndex(indexData);

        let canteenList = loadCanteenItemsList();
        if (canteenList[canteenId]) {
            canteenList[canteenId] = canteenList[canteenId].filter(id => id !== ItemId);
        }

        saveCanteenItemList(canteenList);
    } catch (err) {
        throw err;
    }
}

async function updateData(canteenId, ItemId, image = null, newData = {}) {
    try {
        const data = loadCanteenItems(canteenId);

        if (!data.item || !data.item[ItemId]) {
            // Log available items for debugging
            const availableIds = data.item ? Object.keys(data.item) : [];
            console.error(`Update failed: Item ID ${ItemId} not found in canteen ${canteenId}. Available item IDs: [${availableIds.join(', ')}]`);
            throw new Error(
                `Item ID ${ItemId} not found in canteen ${canteenId}. Available item IDs: [${availableIds.join(', ')}]`
            );
        }

        if (newData && Object.keys(newData).length > 0) {
            // Prevent category change
            if ('category' in newData) {
                delete newData.category;
            }
            Object.assign(data.item[ItemId], newData);
        }

        if (image) {
            const ext = path.extname(image.name);
            const newImagePath = `/images/items/${ItemId}${ext}`;
            const absoluteNewPath = path.join(__dirname, '..', '..', 'public', newImagePath);

            const oldImagePath = data.item[ItemId].ImagePath;
            if (oldImagePath) {
                const oldPath = path.join(__dirname, '..', '..', 'public', oldImagePath);
                if (fs.existsSync(oldPath)) {
                    fs.unlinkSync(oldPath);
                }
            }

            await image.mv(absoluteNewPath);
            data.item[ItemId].ImagePath = newImagePath;
        }

        // 3. Save changes
        fs.writeFileSync(path.join(__dirname, `../../Data/${canteenId}.json`), JSON.stringify(data, null, 4));

    } catch (err) {
        throw err;
    }
}

async function loadItemById(ItemId) {
    try {
        const filePath = await loadItemPath(ItemId);

        if (filePath == null) {
            return null;
        }

        const data = await loadCanteenItems(null, filePath);

        if (!data.item[ItemId]) {
            return null;
        }

        data.item[ItemId].canteenId = data.canteenId;

        return data.item[ItemId];

    } catch (err) {
        throw err;
    }
}

async function loadCanteenDataById(canteen) {
    try {
        let data = await loadCanteenItems(canteen);
        // If core fields empty, try fallback to MySQL table
        if ((!data.CanteenName || !data.Location) && canteen) {
            try {
                const mysql = require('../../Config/mysqlDb');
                const conn = await mysql.getConnection();
                const [rows] = await conn.query('SELECT CanteenId, CanteenName, Location FROM canteen WHERE CanteenId = ?', [canteen]);
                conn.release();
                if (rows && rows.length) {
                    data.CanteenName = data.CanteenName || rows[0].CanteenName || '';
                    data.Location = data.Location || rows[0].Location || '';
                    data.canteenId = data.canteenId || rows[0].CanteenId;
                }
            } catch (e) {
                // ignore fallback error
            }
        }
        const { canteenId, CanteenName, Location, fromTime = '', ToTime = '', accessTo = 'ALL', poster = '' } = data;
        return { canteenId: canteenId ?? Number(canteen), CanteenName, Location, fromTime, ToTime, accessTo, poster };
    } catch (err) {
        throw err;
    }
}

async function getCategoryAll() {
    try {
        if (!fs.existsSync(categoryAllFile)) {
            throw new Error("Category file not found.");
        }
        const data = fs.readFileSync(categoryAllFile, "utf8");
        const categoryData = JSON.parse(data);

        if (!categoryData.Category) {
            return [];
        }

        // Convert the Category object to an array of categories
        const categories = Object.values(categoryData.Category);
        return categories;
    } catch (err) {
        console.error("Error loading category file:", err.message);
        throw new Error("Failed to load category file.");
    }
}

//TODO: pending need review
async function addCategory(canteenId, categoryObj) {
    try {
        // Validate input is an object
        if (!categoryObj || typeof categoryObj !== 'object') {
            throw new Error('Category payload must be an object');
        }
        // Validate name
        const { name, startTime = '9:00', endTime = '17:00', isAvalable = true, avalableDays = [2, 3, 4, 5, 6, 7] } = categoryObj;
        if (!name || typeof name !== 'string' || name.trim() === '') {
            throw new Error('Category name is required and must be a non-empty string');
        }
        // Check if name exists in global category.json
        if (!fs.existsSync(categoryAllFile)) {
            throw new Error('Global category file not found.');
        }
        const globalCategoryData = JSON.parse(fs.readFileSync(categoryAllFile, 'utf8'));
        const globalCategories = globalCategoryData.Category || {};
        const nameLower = name.trim().toLowerCase();
        // Find the exact key (case-insensitive)
        const globalKey = Object.keys(globalCategories).find(
            key => key.toLowerCase() === nameLower
        );
        if (!globalKey) {
            throw new Error(`Category name '${name}' not found in global category list.`);
        }
        // Add canteenId to global category if not present
        const globalCat = globalCategories[globalKey];
        if (!Array.isArray(globalCat.canteenId)) {
            globalCat.canteenId = [];
        }
        if (!globalCat.canteenId.includes(canteenId)) {
            globalCat.canteenId.push(canteenId);
            // Save global category file
            fs.writeFileSync(categoryAllFile, JSON.stringify(globalCategoryData, null, 4));
        }
        // Load canteen data
        const data = await loadCanteenItems(canteenId);
        // Use 'category' array (not 'Category')
        if (!Array.isArray(data.category)) {
            data.category = [];
        }
        // Check for duplicate in canteen
        const exists = data.category.find(cat => cat.name && cat.name.trim().toLowerCase() === nameLower);
        if (exists) {
            throw new Error(`Category '${name}' already exists in canteen ${canteenId}`);
        }
        // Prepare new category object
        const newCategory = {
            name: name.trim(),
            items: [],
            startTime,
            endTime,
            isAvalable,
            DaysAvalable: Array.isArray(avalableDays) ? avalableDays : []
        };
        data.category.push(newCategory);
        // Save changes
        fs.writeFileSync(path.join(__dirname, `../../Data/${canteenId}.json`), JSON.stringify(data, null, 4));
        return newCategory;
    } catch (err) {
        throw err;
    }
}

async function editCategoryCanteen(canteenId, categoryName, newData) {
    try {
        if (!categoryName || typeof categoryName !== 'string' || categoryName.trim() === '') {
            throw new Error('Original category name is required and must be a non-empty string');
        }
        const data = await loadCanteenItems(canteenId);
        if (!Array.isArray(data.category)) {
            throw new Error('No categories found for this canteen');
        }
        const nameLower = categoryName.trim().toLowerCase();
        const catIdx = data.category.findIndex(cat => cat.name && cat.name.trim().toLowerCase() === nameLower);
        if (catIdx === -1) {
            throw new Error(`Category '${categoryName}' not found in canteen ${canteenId}`);
        }
        const cat = data.category[catIdx];
        // If changing name, validate new name
        // if (newData.name && newData.name.trim().toLowerCase() !== nameLower) {
        //     const newName = newData.name.trim();
        //     // Check not duplicate in canteen
        //     if (data.category.some((c, i) => i !== catIdx && c.name && c.name.trim().toLowerCase() === newName.toLowerCase())) {
        //         throw new Error(`Category '${newName}' already exists in canteen ${canteenId}`);
        //     }
        //     // Check exists in global category.json
        //     if (!fs.existsSync(categoryAllFile)) {
        //         throw new Error('Global category file not found.');
        //     }
        //     const globalCategoryData = JSON.parse(fs.readFileSync(categoryAllFile, 'utf8'));
        //     const globalCategories = globalCategoryData.Category || {};
        //     const globalKey = Object.keys(globalCategories).find(
        //         key => key.toLowerCase() === newName.toLowerCase()
        //     );
        //     if (!globalKey) {
        //         throw new Error(`Category name '${newName}' not found in global category list.`);
        //     }
        //     // Remove canteenId from old global category
        //     const oldGlobalKey = Object.keys(globalCategories).find(
        //         key => key.toLowerCase() === nameLower
        //     );
        //     if (oldGlobalKey && Array.isArray(globalCategories[oldGlobalKey].canteenId)) {
        //         globalCategories[oldGlobalKey].canteenId = globalCategories[oldGlobalKey].canteenId.filter(id => id !== canteenId);
        //     }
        //     // Add canteenId to new global category
        //     if (!globalCategories[globalKey].canteenId.includes(canteenId)) {
        //         globalCategories[globalKey].canteenId.push(canteenId);
        //     }
        //     fs.writeFileSync(categoryAllFile, JSON.stringify(globalCategoryData, null, 4));
        //     cat.name = newName;
        // }
        // Update other fields
        if (typeof newData.startTime === 'string') cat.startTime = newData.startTime;
        if (typeof newData.endTime === 'string') cat.endTime = newData.endTime;
        // If times updated, update all items in this category
        if ((typeof newData.startTime === 'string' || typeof newData.endTime === 'string') && Array.isArray(cat.items)) {
            for (const itemId of cat.items) {
                if (data.item && data.item[itemId]) {
                    await redis.del(getKeyRedis('CanteenItem', itemId));
                    if (typeof newData.startTime === 'string') data.item[itemId].startTime = newData.startTime;
                    if (typeof newData.endTime === 'string') data.item[itemId].endTime = newData.endTime;
                }
            }
        }
        if (typeof newData.isAvalable === 'boolean') cat.isAvalable = newData.isAvalable;
        if (Array.isArray(newData.DaysAvalable)) cat.DaysAvalable = newData.DaysAvalable;
        // Save changes
        fs.writeFileSync(path.join(__dirname, `../../Data/${canteenId}.json`), JSON.stringify(data, null, 4));
        return cat;
    } catch (err) {
        throw err;
    }
}

async function getCategoryCanteen(canteenId) {
    try {
        const data = await loadCanteenItems(canteenId);
        if (!Array.isArray(data.category)) {
            return [];
        }
        // Load global category data for poster lookup
        let globalCategories = {};
        if (fs.existsSync(categoryAllFile)) {
            const globalCategoryData = JSON.parse(fs.readFileSync(categoryAllFile, 'utf8'));
            globalCategories = globalCategoryData.Category || {};
        }
        return data.category.map(cat => {
            const name = cat.name || '';
            const nameLower = name.trim().toLowerCase();
            // Find poster from global category (case-insensitive)
            let poster = '';
            const globalKey = Object.keys(globalCategories).find(
                key => key.toLowerCase() === nameLower
            );
            if (globalKey && globalCategories[globalKey].poster) {
                poster = globalCategories[globalKey].poster;
            }
            return {
                name,
                startTime: cat.startTime || '',
                endTime: cat.endTime || '',
                no_of_items: Array.isArray(cat.items) ? cat.items.length : 0,
                avalbleDays: cat.DaysAvalable || [],
                isAvalable: typeof cat.isAvalable === 'boolean' ? cat.isAvalable : true,
                poster
            };
        });
    } catch (err) {
        throw err;
    }
}

async function getItemsByCategory(canteenId, categoryName) {
    try {
        const data = await loadCanteenItems(canteenId);
        if (!Array.isArray(data.category) || !data.item) {
            return [];
        }
        const nameLower = categoryName.trim().toLowerCase();
        const category = data.category.find(cat => cat.name && cat.name.trim().toLowerCase() === nameLower);
        if (!category || !Array.isArray(category.items)) {
            return [];
        }
        const items = [];
        for (const itemId of category.items) {
            if (data.item[itemId]) {
                items.push(data.item[itemId]);
            }
        }
        return items;
    } catch (err) {
        throw err;
    }
}

async function getAllCategoriesForCanteen(canteenId) {
    try {
        const categories = await getCategoryAll();

        const filtered = categories.filter(category => {
            return !category.canteenId.includes(canteenId);
        });

        return filtered;
    } catch (err) {
        throw err;
    }
}

async function getItemIdsByCategoryInCanteen(canteenId, category_name) {
    try {
        const data = await loadCanteenItems(canteenId);
        if (!Array.isArray(data.category) || !data.item) {
            return [];
        }
        const nameLower = category_name.trim().toLowerCase();
        const category = data.category.find(cat => cat.name && cat.name.trim().toLowerCase() === nameLower);
        if (!category || !Array.isArray(category.items)) {
            return [];
        }
        return category.items;
    } catch (err) {
        throw err;
    }
}

async function saveGlobalCategoryData(categoryData) {
    try {
        if (!fs.existsSync(categoryAllFile)) {
            throw new Error("Category file not found.");
        }
        fs.writeFileSync(categoryAllFile, JSON.stringify(categoryData, null, 2));
    } catch (err) {
        throw err;
    }
}

async function addCategoryInGlobal(categoryData, image) {
    try {
        if (!fs.existsSync(categoryAllFile)) {
            throw new Error("Category file not found.");
        }
        const data = fs.readFileSync(categoryAllFile, "utf8");
        const categoryD = JSON.parse(data);

        if (!categoryD.Category) {
            categoryD.Category = {};
        } else if (categoryD.Category[categoryData.name]) {
            throw new Error(`Category name '${categoryData.name}' already exists in global category list.`);
        }

        const imageExtension = image.name.split('.').pop();
        await image.mv(`public/images/categories/${categoryData.name.split(' ').join('_')}.${imageExtension}`);
        categoryData.poster = `/images/categories/${categoryData.name.split(' ').join('_')}.${imageExtension}`;

        categoryD.Category[categoryData.name] = categoryData;

        await saveGlobalCategoryData(categoryD);

        return categoryD;
    } catch (err) {
        console.error("Error loading category file:", err.message);
        throw new Error("Failed to load category file.");
    }
}

async function updateCategoryImageInGlobal(categoryName, image) {
    try {

        if (!fs.existsSync(categoryAllFile)) {
            throw new Error("Category file not found.");
        }
        const data = fs.readFileSync(categoryAllFile, "utf8");
        const categoryD = JSON.parse(data);

        if (categoryD.Category && categoryD.Category[categoryName]) {
            const imageExtension = image.name.split('.').pop();
            const newImagePath = `/images/categories/${categoryName.split(' ').join('_')}.${imageExtension}`;
            const absoluteNewPath = path.join(__dirname, '..', '..', 'public', newImagePath);

            const oldImagePath = categoryD.Category[categoryName].poster;
            if (oldImagePath) {
                const oldPath = path.join(__dirname, '..', '..', 'public', oldImagePath);
                if (fs.existsSync(oldPath)) {
                    fs.unlinkSync(oldPath);
                }
            }

            
            await image.mv(absoluteNewPath);
            categoryD.Category[categoryName].poster = newImagePath;
            // categoryD.Category[categoryName].poster = `/images/categories/${categoryName.split(' ').join('_')}.${imageExtension}`;

            await saveGlobalCategoryData(categoryD);
            return categoryD.Category[categoryName];
        } else {
            throw new Error(`Category '${categoryName}' not found.`);
        }

    } catch (err) {
        console.error("Error updating category image:", err.message);
        throw err;
    }
}

module.exports = {
    loadCanteenItems,
    generateIdForItem,
    saveCanteenData,
    deleteItemWithItemId,
    updateData,
    loadItemById,
    loadCanteenDataById,
    loadCanteenItemsList,
    addCategory,
    getItemsByCategory,
    getCategoryAll,
    editCategoryCanteen,
    getCategoryCanteen,
    getAllCategoriesForCanteen,
    getItemIdsByCategoryInCanteen,
    addCategoryInGlobal,
    updateCategoryImageInGlobal
}