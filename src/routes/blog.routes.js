const {Router}=require("express")
const path=require("path")
const multer=require("multer")
const Blog=require("../modules/blog.modules.js")
const Comment = require("../modules/comment.modules.js")


const router=Router()

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.resolve("../public/uploads"))
  },
  filename: function (req, file, cb) {
    const filename=`${Date.now()}-${file.originalname}`
    cb(null,filename)
  }
})

const upload = multer({ storage: storage })

function requireAuthentication(req, res, next) {
  if (!req.user) {
    return res.redirect("/user/signin")
  }
  next()
}

function requireApiAuthentication(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: "Please sign in to use the AI assistant." })
  }
  next()
}

async function findOwnedBlog(req, res, next) {
  try {
    const blog = await Blog.findById(req.params.id)

    if (!blog) {
      return res.status(404).send("Blog not found")
    }

    if (blog.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).send("You can only manage your own blogs")
    }

    req.blog = blog
    next()
  } catch (error) {
    return res.status(404).send("Blog not found")
  }
}

router.get("/add-new",requireAuthentication,async(req,res)=>{
    return res.render("addblog",{
        user:req.user,
    })
})

router.get("/:id/edit", requireAuthentication, findOwnedBlog, (req, res) => {
  return res.render("editblog", {
    user: req.user,
    blog: req.blog,
  })
})

router.post("/:id/edit", requireAuthentication, findOwnedBlog, upload.single("coverImage"), async (req, res) => {
  const { title, body } = req.body
  const updates = { title, body }

  if (req.file) {
    updates.coverImageUrl = `/uploads/${req.file.filename}`
  }

  await Blog.findByIdAndUpdate(req.blog._id, updates, { runValidators: true })
  return res.redirect(`/blog/${req.blog._id}`)
})

router.post("/:id/delete", requireAuthentication, findOwnedBlog, async (req, res) => {
  await Comment.deleteMany({ blogId: req.blog._id })
  await Blog.findByIdAndDelete(req.blog._id)
  return res.redirect("/")
})

router.post("/ai-assist", requireApiAuthentication, async (req, res) => {
  const { mode, instruction, title = "", body = "" } = req.body || {}
  const modes = {
    draft: "Write a clear, engaging blog post from the user's idea.",
    improve: "Carefully revise the existing blog post for clarity, flow, and readability while preserving its meaning and voice.",
    outline: "Create a useful, well-organized outline for a blog post.",
    title: "Suggest one concise, compelling title for the blog post.",
  }

  if (!Object.hasOwn(modes, mode)) {
    return res.status(400).json({ error: "Choose a valid writing action." })
  }
  if (typeof instruction !== "string" || !instruction.trim() || instruction.length > 1500) {
    return res.status(400).json({ error: "Add an instruction of up to 1,500 characters." })
  }
  if (typeof title !== "string" || title.length > 2000 || typeof body !== "string" || body.length > 20000) {
    return res.status(400).json({ error: "The current title or story is too long to process." })
  }
  const apiKey = process.env.GROQ_API_KEY?.trim()
  if (!apiKey) {
    return res.status(503).json({ error: "The AI assistant is not configured. Add GROQ_API_KEY to the server environment." })
  }

  const model = process.env.GROQ_MODEL?.trim() || "openai/gpt-oss-120b"
  const prompt = [
    modes[mode],
    "Follow the user's instructions and return only the requested content, without commentary about being an AI.",
    `User instructions: ${instruction.trim()}`,
    title.trim() ? `Current title: ${title.trim()}` : "",
    body.trim() ? `Current story:\n${body.trim()}` : "",
  ].filter(Boolean).join("\n\n")

  try {
    let groqResponse
    for (let attempt = 0; attempt < 3; attempt += 1) {
      groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        signal: AbortSignal.timeout(90000),
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.7,
          max_completion_tokens: 2048,
        }),
      })

      if (groqResponse.status !== 503 || attempt === 2) {
        break
      }

      const retryAfter = Number(groqResponse.headers.get("retry-after"))
      const delay = Number.isFinite(retryAfter) && retryAfter >= 0
        ? Math.min(retryAfter * 1000, 5000)
        : 1000 * (attempt + 1)
      await groqResponse.body?.cancel()
      await new Promise((resolve) => setTimeout(resolve, delay))
    }

    if (!groqResponse.ok) {
      const errorData = await groqResponse.json().catch(() => ({}))
      const providerMessage = errorData.error?.message
      console.error(`Groq API request failed with status ${groqResponse.status}${providerMessage ? `: ${providerMessage}` : ""}`)

      if (groqResponse.status === 401 || groqResponse.status === 403) {
        return res.status(502).json({ error: "Groq rejected the API key. Check that GROQ_API_KEY is valid and active." })
      }
      if (groqResponse.status === 404) {
        return res.status(502).json({ error: `The Groq model "${model}" is unavailable. Set GROQ_MODEL to a model enabled for your account, such as openai/gpt-oss-120b.` })
      }
      if (groqResponse.status === 429) {
        return res.status(502).json({ error: "Groq's rate limit or usage quota has been reached. Check your Groq account limits and try again later." })
      }
      if (groqResponse.status === 503) {
        return res.status(503).json({ error: "Groq is temporarily experiencing high demand. Wait a few seconds and try again; your draft has not been changed." })
      }
      if (groqResponse.status === 400) {
        return res.status(502).json({ error: "Groq rejected this request. Try a shorter prompt or check the server log for Groq's error details." })
      }
      return res.status(502).json({ error: "Groq is temporarily unavailable. Please try again shortly." })
    }

    const data = await groqResponse.json()
    const result = data.choices?.[0]?.message?.content?.trim()

    if (!result) {
      const finishReason = data.choices?.[0]?.finish_reason
      console.error(`Groq API returned no generated text${finishReason ? ` (finish reason: ${finishReason})` : ""}`)
      return res.status(502).json({ error: "Groq returned no generated text. Try a different instruction." })
    }

    return res.json({ result })
  } catch (error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      return res.status(504).json({ error: "Groq took too long to respond. Please try again." })
    }
    console.error("Groq AI request failed:", error.message)
    return res.status(502).json({ error: "The AI assistant is temporarily unavailable. Please try again." })
  }
})


router.get("/:id",async(req,res)=>{
    const blog=await Blog.findById(req.params.id).populate("createdBy")
    const comments=await Comment.find({blogId:req.params.id}).populate("createdBy")
    console.log(comments)
    return res.render("blog",{
        user:req.user,
        blog,
        comments,
})
})


router.post("/",requireAuthentication,upload.single('coverImage'),async(req,res)=>{
    const { title, body } = req.body || {}
    if (typeof title !== "string" || !title.trim() || typeof body !== "string" || !body.trim()) {
      return res.status(400).send("A story title and story content are required.")
    }

    const newBlog = {
        body: body.trim(),
        title: title.trim(),
        createdBy:req.user._id ,
    }
    if (req.file) {
      newBlog.coverImageUrl = `/uploads/${req.file.filename}`
    }
    const blog=await Blog.create(newBlog)
    return res.redirect(`/blog/${blog._id}`)
})

router.post("/comment/:blogId",requireAuthentication,async (req,res)=>{
console.log(req.params.blogId);
   await Comment.create({
        content: req.body.content,
        blogId:req.params.blogId,
        createdBy:req.user._id,
    })
    return res.redirect(`/blog/${req.params.blogId}`)
})

module.exports=router
