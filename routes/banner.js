const express = require('express')
const router = express.Router()
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()
const { adminAuth } = require('../middleware/auth')
const multer = require('multer')
const path = require('path')
const fs = require('fs')

// Uploads directory (read-only on Vercel, writable locally)
const uploadsDir = path.join(__dirname, '..', 'uploads', 'banners')
try {
    if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true })
    }
} catch (e) {
    // Vercel has read-only filesystem — uploads won't work but app won't crash
    console.warn('Could not create uploads dir (read-only fs):', e.message)
}

// Multer config for image uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname)
        cb(null, `banner_${Date.now()}${ext}`)
    }
})

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: (req, file, cb) => {
        const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg']
        const ext = path.extname(file.originalname).toLowerCase()
        if (allowed.includes(ext)) cb(null, true)
        else cb(new Error('Only images allowed'))
    }
})

// PUBLIC: Get active banners (for homepage)
router.get('/', async (req, res) => {
    try {
        const banners = await prisma.banner.findMany({
            where: { isActive: true },
            orderBy: { sortOrder: 'asc' }
        })
        res.json({ success: true, data: banners })
    } catch (err) {
        res.status(500).json({ success: false, message: err.message })
    }
})

// ADMIN: Get all banners
router.get('/all', adminAuth, async (req, res) => {
    try {
        const banners = await prisma.banner.findMany({ orderBy: { sortOrder: 'asc' } })
        res.json({ success: true, data: banners })
    } catch (err) {
        res.status(500).json({ success: false, message: err.message })
    }
})

// ADMIN: Create banner with image upload
router.post('/', adminAuth, upload.single('image'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: 'Image is required' })

        const { title, description, linkUrl, sortOrder } = req.body
        const imageUrl = `/uploads/banners/${req.file.filename}`

        const banner = await prisma.banner.create({
            data: {
                title: title || 'Banner',
                description: description || null,
                imageUrl,
                linkUrl: linkUrl || null,
                sortOrder: parseInt(sortOrder) || 0,
            }
        })

        res.json({ success: true, data: banner })
    } catch (err) {
        res.status(500).json({ success: false, message: err.message })
    }
})

// ADMIN: Update banner
router.put('/:id', adminAuth, upload.single('image'), async (req, res) => {
    try {
        const { id } = req.params
        const { title, description, linkUrl, sortOrder, isActive } = req.body
        const updateData = {}

        if (title !== undefined) updateData.title = title
        if (description !== undefined) updateData.description = description
        if (linkUrl !== undefined) updateData.linkUrl = linkUrl
        if (sortOrder !== undefined) updateData.sortOrder = parseInt(sortOrder)
        if (isActive !== undefined) updateData.isActive = isActive === 'true' || isActive === true

        if (req.file) {
            // Delete old image
            const old = await prisma.banner.findUnique({ where: { id } })
            if (old && old.imageUrl) {
                const oldPath = path.join(__dirname, '..', old.imageUrl)
                if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath)
            }
            updateData.imageUrl = `/uploads/banners/${req.file.filename}`
        }

        const banner = await prisma.banner.update({ where: { id }, data: updateData })
        res.json({ success: true, data: banner })
    } catch (err) {
        res.status(500).json({ success: false, message: err.message })
    }
})

// ADMIN: Delete banner
router.delete('/:id', adminAuth, async (req, res) => {
    try {
        const banner = await prisma.banner.findUnique({ where: { id: req.params.id } })
        if (!banner) return res.status(404).json({ success: false, message: 'Not found' })

        // Delete image file
        if (banner.imageUrl) {
            const imgPath = path.join(__dirname, '..', banner.imageUrl)
            if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath)
        }

        await prisma.banner.delete({ where: { id: req.params.id } })
        res.json({ success: true, message: 'Deleted' })
    } catch (err) {
        res.status(500).json({ success: false, message: err.message })
    }
})

module.exports = router
