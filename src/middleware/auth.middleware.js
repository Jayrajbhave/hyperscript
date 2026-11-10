const { validateToken } = require("../utiles/auth.utiles")

function checkForAuthenticationCookie(cookieName){
    return (req,res,next)=>{
        const tokenCookieValue=req.cookies[cookieName]
    if(!tokenCookieValue){
        return next()
    }
    try {
        const userPlayload=validateToken(tokenCookieValue)
        req.user=userPlayload
    } catch (error) {}
    return next()
    }
}
module.exports={
    checkForAuthenticationCookie,
}