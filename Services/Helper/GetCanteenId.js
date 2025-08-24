const redis=require('../../Config/redisClint');
const db=require('../../Config/mysqlDb');
const getKeyRedis=require('./GetKeysRedis');

const canteensTIme=process.env.redis_time_canteens;

async function getIds() {
    let conn;

    try{
        
        let canteens=await redis.get(getKeyRedis('canteens'));

        if(canteens){
            canteens=JSON.parse(canteens);
        }else{
            conn=await db.getConnection();
            const query=`select CanteenId from canteen`;
            let [result]=await conn.query(query);
            canteens=result.map(row => row.CanteenId);
        }

        await redis.setex(getKeyRedis('canteens'),canteensTIme,JSON.stringify(canteens));

        return canteens;
    }catch(err){
        console.error('getIds error:', err); // Log the real error
        throw new Error("Internal Server err.");
    }finally{
        if(conn) conn.release();
    }
}

module.exports={
    getIds,
}

