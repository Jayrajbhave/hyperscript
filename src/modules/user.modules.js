// const {createHmac,randomBytes}=require("crypto")
const crypto = require('crypto');
const {Schema,model}=require("mongoose")
const {createTokenForUser}=require("../utiles/auth.utiles.js")

const userSchema=new Schema({
    fullname:{
        type:String,
        require:true,
    },
    email:{
        type:String,
        require:true,
        unique:true,
    },
    salt:{
        type:String,
    },
    password:{
        type:String,
        require:true,
    },
    profileImageUrl:{
        type:String,
        default:"/images/default.png", 
    },
    role:{
        type:String,
        enum:["USER","ADMIN"],
        default:"USER",
    }
    
},{timestamps:true})

userSchema.pre('save',function(next){
    const user=this;

    if(!user.isModified("password")) return next()
    const salt=crypto.randomBytes(16).toString()
    const hashedPassword=crypto.createHmac("sha256",salt)
                                    .update(user.password)
                                    .digest("hex")

    this.salt=salt
    this.password=hashedPassword
    next
})

userSchema.static("matchedPasswordAndGenerateToken",async function(email,password){
    const user=await this.findOne({email})
    if(!user) throw new Error("user not found ")

    const salt=user.salt
    const hashedPassword=user.password

    const userprovidedHash=crypto.createHmac("sha256",salt)
                                    .update(password)
                                    .digest("hex")


    if(hashedPassword !==userprovidedHash)
         throw new Error("Incorrct password ")

    const token=createTokenForUser(user)
    return token
})


const User=model("user",userSchema) 
module.exports = User