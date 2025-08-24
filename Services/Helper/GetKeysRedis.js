function getKeyRedis(key,value=""){
    if(key=="canteen"){
        return `canteen:${value}`;
    }
    else if(key=="CanteenItem"){
        return `CanteenItem:${value}`;
    }
    else if(key=="category"){
        return `category:${value}`;
    }else if(key=="userOrders"){
        return `userOrders:${value}`;//value is userID
    }else if(key=="canteenOrders"){
        return `canteenOrders:${value}`;//value is canteenID
    }else if(key=="UserCart"){
        return `UserCart:${value}`;//value is userID
    }else if(key=="canteens"){
        return `canteens`;
    }else if(key=="tg_notified"){
        return `tg_notified:${value}`; // value is order/transaction id
    }else if(key==="tg_msgmap"){
        return `tg_msgmap:${value}`; // stores JSON array of {chatId,messageId,text}
    }
}

module.exports = getKeyRedis;