const express=require('express')
const app=express()

const cors=require('cors')
app.use(cors());


const dotenv=require('dotenv')
dotenv.config()

app.use(express.json())
const mysql=require('mysql2')

const pool=mysql.createPool({
  host: process.env.MYSQLHOST,
  user: process.env.MYSQLUSER,
  password: process.env.MYSQLPASSWORD,
  database: process.env.MYSQLDATABASE,
  port: process.env.MYSQLPORT
}).promise()

app.get('/get-all-products/:table',async(req,res)=>{
    try {
        const {table}=req.params;
        const TABLES= process.env.TABLES.split(',');

        if (!TABLES.includes(table)) {
            return res.status(403).json({ success: false, data: "Invalid table name" });
        }

        const products=await pool.query(`
        SELECT * FROM ${table}
        order by price DESC;
        `)
        res.status(200).json({success:true,data:products[0]})
    } catch (error) {
        console.error(error)
        res.status(500).json({success:false,data:"internal server error"})
    }
})

app.post('/add-products/:table',async(req,res)=>{
    try {
      const {table}=req.params;
      const TABLES = process.env.TABLES.split(',');

      if (!TABLES.includes(table)) {
          return res.status(403).json({ success: false, data: "Invalid table name" });
      }

        if(!req.body){
            return res.status(403).json({success:true,data:"enter a valid json"})
        }
        if(!Array.isArray(req.body)&&req.body){
            await pool.query(`
                 INSERT INTO ${table} (id,name,price,image,link)
                    VALUES(?,?,?,?,?);
                `,[req.body.id, req.body.name, req.body.price, req.body.image, req.body.link])
                return res.status(201).json({success:true,data:"new product created!"})
        }
        for(let i = 0; i<req.body.length;i++){
            await pool.query(`
                    INSERT INTO ${table} (id,name,price,image,link)
                    VALUES(?,?,?,?,?);
                    `,[req.body[i].id, req.body[i].name, req.body[i].price, req.body[i].image, generateAffiliateLink(req.body[i].link)])
        }
        res.status(201).json({success:true,data:"products added successfully"})
    } catch (error) {
        console.error(error)
        res.status(500).json({success:false,data:"internal server error"})
    }
})

app.post('/draw-products/:limit/:keyword/:table', async (req, res) => {
  try {
    const { limit, keyword,table } = req.params;
    const token = await getToken();
    const TABLES = process.env.TABLES.split(',');

    if (!TABLES.includes(table)) {
        return res.status(403).json({ success: false, data: "Invalid table name" });
    }


    const filter = encodeURIComponent('buyerReviews.rating>=4 AND buyerReviews.count>=20');
    const rawJson = await fetch(`https://api.ebay.com/buy/browse/v1/item_summary/search?q=${keyword}&limit=${limit}&filter=${filter}`, {
      headers: {
        'authorization': 'Bearer ' + token,
        'content-type': 'application/json'
      }
    });

    const ebayData = await rawJson.json();

    const products = ebayData.itemSummaries.map(element => ({
      id: element.itemId,
      name: element.title,
      image: element.image?.imageUrl,
      price: element.price?.value,
      link: element.itemWebUrl
    }));

    const resource=process.env.RESOURCE||'http://localhost:5000';

    const response = await fetch(resource+'/add-products/'+table, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(products)
    });

    const parsedResponse = await response.json();

    return res.status(200).json(parsedResponse);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, data: "Internal server error" });
  }
});

app.delete('/delete-all-products/:password/:table',async(req,res)=>{
    try {
        const {password,table}=req.params;
        if(password!=process.env.DELETE_PASSWORD){
            return res.status(401).json({success:false,data:"unauthorized"})
        }
        await pool.query(`
            DELETE FROM ${table};
            `)
        return res.status(200).json({success:true,data:"all products deleted"})
    } catch (error) {
        res.status(500).json({success:false,data:"internal server error"})
    }
})

const eBayAuthToken = require('ebay-oauth-nodejs-client');

const ebayAuth = new eBayAuthToken({
  clientId: process.env.EBAY_CLIENT_ID,
  clientSecret: process.env.EBAY_CLIENT_SECRET,
});

async function getToken() {
  try {
    const token = await ebayAuth.getApplicationToken('PRODUCTION', [
      process.env.EBAY_SCOPE
    ]);

    return JSON.parse(token).access_token; // ✅ return this
  } catch (error) {
    console.error('Error getting token:', error);
    return null;
  }
}
function generateAffiliateLink(cleanProductUrl) {
    const campaignId = process.env.CAMPAIGN_ID; // Your actual campaign ID
    const urlObj = new URL(cleanProductUrl);

    // Get only origin (protocol + host) + pathname (path)
    const cleanUrl = urlObj.origin + urlObj.pathname;
    const productId = cleanUrl.split("/")[4];

    if(!productId){
      throw new Error("Invalid product URL, productId missing");
    }

    return `https://www.ebay.com/itm/${productId}?mkcid=1&mkrid=711-53200-19255-0&siteid=0&campid=${campaignId}&customid=&toolid=10001&mkevt=1`;
}


app.all('*',(req,res)=>{
   res.status(404).json({success:false,data:"page not found"})
})

const port=process.env.PORT||5000
app.listen(port,()=>{
    console.log('listening on port '+port+'...')
})
