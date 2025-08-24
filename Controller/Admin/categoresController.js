const itemRepo=require('../../Services/itemsServices/itemsCRUD');

async function addCategory(req, res,) {
    try {

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

            // if (images[0].size > 50 * 1024) {
            //     throw new Error("Image size should be less than 50KB.");
            // }

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

        try {
            await itemRepo.addCategoryInGlobal(jsonData, images[0]);
            return res.json({ code: 1, message: "Category added successfully." });
        } catch (err) {
            console.error(err);
            return res.json({ code: 0, message: err.message });
        }

    } catch (err) {
        console.error(err);
        res.status(500).json({ code: 0, message: "Internal server error." });
    }

}

async function updateCategoryImage(req,res){
    try{

        let images,categoryName;
        try {

            categoryName=req.query.category;

            if(!categoryName){
                return res.json({ code: 0, message: 'Please provide category name.' });
            }

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

            // if (images[0].size > 50 * 1024) {
            //     throw new Error("Image size should be less than 50KB.");
            // }

        } catch (err) {
            console.log(err);
            return res.json({ code: 0, message: err.message });
        }

        try{
            await itemRepo.updateCategoryInGlobal(categoryName, images[0]);
            return res.json({ code: 1, message: "Category image updated successfully." });
        }catch(err){
            console.error(err);
            if(err.message.includes("not found")){
                return res.json({ code: 0, message: err.message });
            }

            throw err;
        }

    }catch(errr){
        console.error(errr);
        return res.json({ code: -1, message: 'Internal server error.' });
    }
}

async function getAllCategories(req, res) {
    try{
        const categories = await itemRepo.getAllCategoriesGlobal();
        return res.json({ code: 1, data: categories });
    }catch(err){
        console.error(err);
        return res.json({ code: -1, message: 'Internal server error.' });
    }
}

module.exports = {
    addCategory,
    updateCategoryImage,
    getAllCategories
};