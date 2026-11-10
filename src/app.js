require("dotenv").config()
const express=require("express")
const path=require("path")
const mongoose=require("mongoose")
const cookieParser=require("cookie-parser")
const { checkForAuthenticationCookie } = require("./middleware/auth.middleware.js")


const Blog=require("./modules/blog.modules.js")

const userRoute=require("./routes/user.routes.js")
const blogRoute=require("./routes/blog.routes.js")

const app=express()
const PORT=process.env.PORT || 8080

mongoose
.connect(process.env.MONGO_URL)
.then((e)=>console.log("mongodb is connected"))

app.set("view engine",'ejs')
app.set('views',path.resolve("./views"))

app.use(express.urlencoded({extended:false}))
app.use(cookieParser())
app.use(checkForAuthenticationCookie("token"))
app.use(express.static(path.resolve("../public")))
app.use(express.json());

app.get('/',async(req,res)=>{
    const allBlogs=await Blog.find({})
    res.render('home',{
        user:req.user,
        blogs:allBlogs,
    })
})

app.use("/user",userRoute)
app.use("/blog",blogRoute)

app.listen(PORT,()=>{
    console.log(`Server is listing on the port:${PORT}`);
})
