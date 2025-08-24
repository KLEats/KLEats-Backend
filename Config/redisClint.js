const Redis=require('ioredis');

const redis=new Redis({
  host:process.env.redis_host,
  port:process.env.redis_port,
  password:process.env.redis_password,
  maxRetriesPerRequest: null
});

module.exports=redis;