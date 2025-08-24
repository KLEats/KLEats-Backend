const db=require('../../Config/mysqlDb');

async function getUserProfile(req,res) {

  let conn;
  try{
    const userId = req.query.userId;

    conn = await db.getConnection();
    conn.query('select * from users where userId=?', [userId])
      .then(result => {
        conn.release();

        const userProfile = {
          userId: result[0][0].userId,
          name: result[0][0].name,
          email: result[0][0].email,
          phoneNo: result[0][0].phoneNo,
          cId: result[0][0].cId,
          role: result[0][0].role,
          DayOrHos: result[0][0].DayOrHos
        };
        return res.status(200).json({ code: 1, data: userProfile });
      }).catch(err => {
        console.log(err.message);
        return res.status(500).json({ code: 0, message: 'Error while fetching user data.' });
      });


  }catch(err){
    console.error('getUserProfile error:', err);
    return res.status(500).json({code: -1, message: 'Internal Server Error'});
  }finally {
    if (conn) conn.release();
  }
}

module.exports = {
  getUserProfile
};