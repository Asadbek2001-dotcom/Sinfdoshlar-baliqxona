
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const fs = require("fs");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;
const DATA = path.join(__dirname, "data.json");

const USERS = [
  {id:"boss1", name:"Boshliq 1", role:"boss", code:"1001"},
  {id:"boss2", name:"Boshliq 2", role:"boss", code:"1002"},
  {id:"admin1", name:"Admin 1", role:"admin", code:"2001"},
  {id:"admin2", name:"Admin 2", role:"admin", code:"2002"},
  {id:"waiter1", name:"Ofitsant 1", role:"waiter", code:"3001"},
  {id:"waiter2", name:"Ofitsant 2", role:"waiter", code:"3002"},
  {id:"waiter3", name:"Ofitsant 3", role:"waiter", code:"3003"},
  {id:"waiter4", name:"Ofitsant 4", role:"waiter", code:"3004"},
  {id:"waiter5", name:"Ofitsant 5", role:"waiter", code:"3005"}
];

const menu = [
 {id:"fish_oq",cat:"Baliq",name:"Oq baliq",price:50000,perKg:true},
 {id:"fish_laq",cat:"Baliq",name:"Laqqa baliq",price:45000,perKg:true},
 {id:"fish_saz",cat:"Baliq",name:"Sazan baliq",price:75000,perKg:true},
 {id:"fish_bux",cat:"Baliq",name:"Buxarski baliq",price:85000,perKg:true},
 {id:"sh_qoy",cat:"Shashlik",name:"Qo‘y go‘shti",price:24000},
 {id:"sh_mol",cat:"Shashlik",name:"Mol go‘shti",price:22000},
 {id:"sh_dum",cat:"Shashlik",name:"Qo‘y dumma",price:15000},
 {id:"sh_qiy",cat:"Shashlik",name:"Qiyma",price:15000},
 {id:"sh_qan",cat:"Shashlik",name:"Qanot",price:15000},
 {id:"sh_tov",cat:"Shashlik",name:"Tovuq go‘shti",price:15000},
 {id:"sh_ind",cat:"Shashlik",name:"Induk go‘shti",price:15000},
 {id:"food_osh",cat:"Taom",name:"Zakaz osh",price:320000},
 {id:"food_qot",cat:"Taom",name:"Zakaz qotirma",price:280000},
 {id:"food_sho",cat:"Taom",name:"Zakaz sho‘rva",price:270000},
 {id:"food_dim",cat:"Taom",name:"Zakaz dimlama",price:280000},
 {id:"food_lag",cat:"Taom",name:"Lag‘mon",price:25000},
 {id:"cola05",cat:"Ichimlik",name:"Cola 0.5",price:8000},
 {id:"cola1",cat:"Ichimlik",name:"Cola 1 l",price:12000},
 {id:"cola15",cat:"Ichimlik",name:"Cola 1.5 l",price:15000},
 {id:"cola2",cat:"Ichimlik",name:"Cola 2 l",price:18000},
 {id:"fanta05",cat:"Ichimlik",name:"Fanta 0.5",price:8000},
 {id:"fanta1",cat:"Ichimlik",name:"Fanta 1 l",price:12000},
 {id:"fanta15",cat:"Ichimlik",name:"Fanta 1.5 l",price:15000},
 {id:"fanta2",cat:"Ichimlik",name:"Fanta 2 l",price:18000},
 {id:"pepsi05",cat:"Ichimlik",name:"Pepsi 0.5",price:8000},
 {id:"pepsi1",cat:"Ichimlik",name:"Pepsi 1 l",price:12000},
 {id:"pepsi15",cat:"Ichimlik",name:"Pepsi 1.5 l",price:15000},
 {id:"pepsi2",cat:"Ichimlik",name:"Pepsi 2 l",price:18000},
 {id:"extra_non",cat:"Qo‘shimcha",name:"Non",price:3000},
 {id:"extra_sous",cat:"Qo‘shimcha",name:"Sous",price:3000}
];

function initialData(){
  return {orders:[], external:[], seq:1, extSeq:1, menu, rooms:Array.from({length:22},(_,i)=>({id:"room"+(i+1),name:"Xona "+(i+1),type:"room",busy:false})), beds:Array.from({length:6},(_,i)=>({id:"bed"+(i+1),name:"Karavot "+(i+1),type:"bed",busy:false})), hall:{id:"hall",name:"Zal",type:"hall",busy:false}, waiters:{}};
}
function load(){
  try { if(fs.existsSync(DATA)) return JSON.parse(fs.readFileSync(DATA,"utf8")); } catch(e){}
  const d=initialData(); save(d); return d;
}
function save(d){ fs.writeFileSync(DATA, JSON.stringify(d,null,2)); }
let db=load();

app.use(express.json());
app.use(express.static(path.join(__dirname,"public")));
app.get("/api/bootstrap",(req,res)=>res.json({users:USERS.map(u=>({id:u.id,name:u.name,role:u.role})), menu:db.menu, rooms:db.rooms, beds:db.beds, hall:db.hall}));
app.post("/api/login",(req,res)=>{
  const u=USERS.find(x=>x.code===String(req.body.code||""));
  if(!u) return res.status(401).json({error:"Kod noto‘g‘ri"});
  res.json({user:{id:u.id,name:u.name,role:u.role}});
});
app.get("/api/state",(req,res)=>res.json(db));

function canWeight(role){return role==="boss"||role==="admin";}
function subtotal(items){return (items||[]).reduce((s,x)=>s+(Number(x.total)||0),0);}
function refreshBusy(){
  const active = new Set(db.orders.filter(o=>o.status==="open").map(o=>o.placeId));
  db.rooms.forEach(x=>x.busy=active.has(x.id));
  db.beds.forEach(x=>x.busy=active.has(x.id));
  db.hall.busy=active.has(db.hall.id);
}
function broadcast(){refreshBusy(); save(db); io.emit("state",db);}

app.post("/api/order",(req,res)=>{
  const {user,placeId,placeName,items,initial=true,customer} = req.body;
  if(!user || !placeId || !Array.isArray(items) || !items.length) return res.status(400).json({error:"Ma’lumot yetarli emas"});
  const validUser=USERS.find(u=>u.id===user.id);
  if(!validUser) return res.status(401).json({error:"Foydalanuvchi noto‘g‘ri"});
  for(const item of items){
    const m=db.menu.find(x=>x.id===item.menuId);
    if(!m) return res.status(400).json({error:"Menyu topilmadi"});
    if(m.perKg){
      if(!canWeight(validUser.role)) return res.status(403).json({error:"Baliq og‘irligini faqat Boshliq/Admin kiritadi"});
      const kg=Number(item.kg);
      if(!(kg>0)) return res.status(400).json({error:"Baliq kg miqdorini kiriting"});
      item.unitPrice=m.price; item.kg=kg; item.total=kg*m.price;
    } else {
      item.unitPrice=m.price; item.qty=Math.max(1,Number(item.qty||1)); item.total=m.price*item.qty;
    }
    item.name=m.name; item.perKg=!!m.perKg;
  }
  const existing=db.orders.find(o=>o.placeId===placeId && o.status==="open");
  const isInitialOrder=!existing;
  const order={
    id:"ORD-"+String(db.seq++).padStart(5,"0"),
    placeId, placeName:placeName||placeId,
    userId:validUser.id,userName:validUser.name,
    items, createdAt:new Date().toISOString(),
    status:"open", initial:isInitialOrder,
    serviceFee:isInitialOrder ? subtotal(items)*0.10 : 0,
    customer:customer||null
  };
  db.orders.push(order); broadcast(); res.json(order);
});

app.post("/api/external",(req,res)=>{
  const {user,customerName,phone,items}=req.body;
  const u=USERS.find(x=>x.id===user?.id);
  if(!u) return res.status(401).json({error:"Foydalanuvchi noto‘g‘ri"});
  if(!Array.isArray(items)||!items.length) return res.status(400).json({error:"Zakaz bo‘sh"});
  const fixed=items.map(x=>{
    const m=db.menu.find(y=>y.id===x.menuId); if(!m) throw new Error("Menyu topilmadi");
    const qty=Math.max(1,Number(x.qty||1)); return {menuId:m.id,name:m.name,qty,unitPrice:m.price,total:m.price*qty};
  });
  const o={id:"EXT-"+String(db.extSeq++).padStart(5,"0"),customerName:(customerName||"Mijoz").trim(),phone:(phone||"").trim(),items:fixed,total:subtotal(fixed),userId:u.id,userName:u.name,createdAt:new Date().toISOString(),status:"open"};
  db.external.push(o); broadcast(); res.json(o);
});
app.post("/api/close",(req,res)=>{
  const {user,placeId}=req.body; const u=USERS.find(x=>x.id===user?.id);
  if(!u) return res.status(401).json({error:"Foydalanuvchi noto‘g‘ri"});
  const os=db.orders.filter(o=>o.placeId===placeId&&o.status==="open");
  if(!os.length) return res.status(404).json({error:"Ochiq hisob yo‘q"});
  os.forEach(o=>o.status="paid"); broadcast(); res.json({ok:true});
});
app.post("/api/delete",(req,res)=>{
  const {user,id,type}=req.body; const u=USERS.find(x=>x.id===user?.id);
  if(!u || !["boss","admin"].includes(u.role)) return res.status(403).json({error:"Faqat Boshliq/Admin o‘chira oladi"});
  if(type==="external") db.external=db.external.filter(x=>x.id!==id);
  else db.orders=db.orders.filter(x=>x.id!==id);
  broadcast(); res.json({ok:true});
});
app.post("/api/waiter-status",(req,res)=>{
  const {user,online}=req.body; const u=USERS.find(x=>x.id===user?.id);
  if(!u||u.role!=="waiter") return res.status(403).json({error:"Faqat ofitsant"});
  db.waiters[u.id]={name:u.name,online:!!online,updatedAt:new Date().toISOString()}; broadcast(); res.json(db.waiters[u.id]);
});
app.post("/api/menu",(req,res)=>{
  const {user,action,item}=req.body; const u=USERS.find(x=>x.id===user?.id);
  if(!u||!["boss","admin"].includes(u.role)) return res.status(403).json({error:"Faqat Boshliq/Admin"});
  if(action==="add"){ if(!item?.name||!(Number(item.price)>0)) return res.status(400).json({error:"Nom va narx kerak"}); item.id="m_"+Date.now(); item.price=Number(item.price); item.perKg=!!item.perKg; item.cat=item.cat||"Boshqa"; db.menu.push(item);}
  if(action==="edit"){const i=db.menu.findIndex(x=>x.id===item.id); if(i<0)return res.status(404).json({error:"Topilmadi"}); db.menu[i]={...db.menu[i],...item,price:Number(item.price)};}
  if(action==="delete"){db.menu=db.menu.filter(x=>x.id!==item.id);}
  broadcast(); res.json(db.menu);
});
io.on("connection",socket=>socket.emit("state",db));
server.listen(PORT,()=>console.log("Sinfdoshlar V3 server: "+PORT));
