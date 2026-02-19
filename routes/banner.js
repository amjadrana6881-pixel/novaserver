const express = require('express')
const router = express.Router()
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()
const { adminAuth } = require('../middleware/auth')
const multer = require('multer')
const path = require('path')

// Multer config for memory storage (Vercel compatible)
const storage = multer.memoryStorage()

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

// Helper to convert buffer to base64 data URI
const bufferToDataURI = (buffer, mimetype) => {
    return `data:${mimetype};base64,${buffer.toString('base64')}`
}

// PUBLIC: Get active banners
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

// ADMIN: Create banner
router.post('/', adminAuth, upload.single('image'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: 'Image is required' })

        const { title, description, linkUrl, sortOrder } = req.body
        const imageUrl = bufferToDataURI(req.file.buffer, req.file.mimetype)

        const banner = await prisma.banner.create({
            data: {
                title: title || 'Banner',
                description: description || null,
                imageUrl, // Store base64 direct
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
            updateData.imageUrl = bufferToDataURI(req.file.buffer, req.file.mimetype)
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
        await prisma.banner.delete({ where: { id: req.params.id } })
        res.json({ success: true, message: 'Deleted' })
    } catch (err) {
        res.status(500).json({ success: false, message: err.message })
    }
})

module.exports = router
