const { v2: cloudinary } = require('cloudinary');

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true
});

const productFolder = process.env.CLOUDINARY_PRODUCT_FOLDER || 'anhtraisstore/products';
const bannerFolder = process.env.CLOUDINARY_BANNER_FOLDER || 'anhtraisstore/banners';
const avatarFolder = process.env.CLOUDINARY_AVATAR_FOLDER || 'anhtraisstore/avatars';
const categoryFolder = process.env.CLOUDINARY_CATEGORY_FOLDER || 'anhtraisstore/categories';

function ensureConfigured() {
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
        const error = new Error('Cloudinary chưa được cấu hình đầy đủ!');
        error.status = 503;
        throw error;
    }
}

function uploadImageStream(file, folder, errorMessage, callback) {
    try {
        ensureConfigured();
        const stream = cloudinary.uploader.upload_stream({
            folder,
            resource_type: 'image',
            use_filename: true,
            unique_filename: true,
            overwrite: false
        }, (error, result) => {
            if (error || !result?.secure_url || !result?.public_id) {
                console.error('Cloudinary image upload error:', error?.message || 'Invalid upload response');
                return callback(Object.assign(new Error(errorMessage), { status: 502 }));
            }
            callback(null, {
                path: result.secure_url,
                filename: result.public_id,
                cloudinaryPublicId: result.public_id,
                size: result.bytes
            });
        });
        file.stream.pipe(stream);
    } catch (error) {
        callback(error);
    }
}

async function destroyPublicId(publicId) {
    if (!publicId) return false;
    ensureConfigured();
    const result = await cloudinary.uploader.destroy(publicId, {
        resource_type: 'image',
        invalidate: true
    });
    return ['ok', 'not found'].includes(result?.result);
}

function publicIdFromCloudinaryUrl(value) {
    if (typeof value !== 'string') return null;
    try {
        const url = new URL(value);
        if (url.protocol !== 'https:' || url.hostname !== 'res.cloudinary.com') return null;
        const marker = url.pathname.split('/').findIndex(part => part === 'upload');
        if (marker < 0) return null;
        const remaining = url.pathname.split('/').slice(marker + 1);
        const versionIndex = remaining.findIndex(part => /^v\d+$/.test(part));
        const publicParts = versionIndex >= 0 ? remaining.slice(versionIndex + 1) : remaining;
        if (publicParts.length === 0) return null;
        const encodedId = publicParts.join('/').replace(/\.[a-z0-9]+$/i, '');
        return decodeURIComponent(encodedId);
    } catch (error) {
        return null;
    }
}

async function destroyCloudinaryUrls(urls = []) {
    const publicIds = [...new Set(urls.map(publicIdFromCloudinaryUrl).filter(Boolean))];
    const results = await Promise.allSettled(publicIds.map(destroyPublicId));
    results.forEach((result, index) => {
        if (result.status === 'rejected') {
            console.error(`Cloudinary cleanup error (${publicIds[index]}):`, result.reason?.message || result.reason);
        }
    });
}

async function destroyUploadedFiles(files = []) {
    const publicIds = [...new Set(files.map(file => file?.cloudinaryPublicId).filter(Boolean))];
    const results = await Promise.allSettled(publicIds.map(destroyPublicId));
    results.forEach((result, index) => {
        if (result.status === 'rejected') {
            console.error(`Cloudinary rollback error (${publicIds[index]}):`, result.reason?.message || result.reason);
        }
    });
}

const destroyUploadedProductFiles = destroyUploadedFiles;

function createCloudinaryStorage(folder, errorMessage) {
    return {
        _handleFile(req, file, callback) {
            uploadImageStream(file, folder, errorMessage, callback);
        },
        _removeFile(req, file, callback) {
            destroyPublicId(file?.cloudinaryPublicId)
                .then(() => callback(null))
                .catch(error => callback(error));
        }
    };
}

const productCloudinaryStorage = createCloudinaryStorage(productFolder, 'Không thể tải ảnh sản phẩm lên cloud!');
const bannerCloudinaryStorage = createCloudinaryStorage(bannerFolder, 'Không thể tải ảnh banner lên cloud!');
const categoryCloudinaryStorage = createCloudinaryStorage(categoryFolder, 'Không thể tải ảnh danh mục lên cloud!');
const avatarCloudinaryStorage = createCloudinaryStorage(avatarFolder, 'Không thể tải ảnh đại diện lên cloud!');

module.exports = {
    productCloudinaryStorage,
    bannerCloudinaryStorage,
    categoryCloudinaryStorage,
    avatarCloudinaryStorage,
    destroyPublicId,
    publicIdFromCloudinaryUrl,
    destroyCloudinaryUrls,
    destroyUploadedFiles,
    destroyUploadedProductFiles
};
