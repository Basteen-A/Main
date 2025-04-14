const express = require('express');
const multer = require('multer');
const axios = require('axios');
const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage });

// Plant analysis endpoint
router.post('/analyze', upload.single('image'), async (req, res) => {
  try {
    const { plantName, latitude, longitude } = req.body;
    const image = req.file;

    let analysisResult;

    if (image) {
      // Use Plant.id API for image-based plant identification
      const plantIdResponse = await axios.post('https://api.plant.id/v2/identify', {
        api_key: 'Gmfe32z-bAhZewOoh2HCQUIqIco2HFQTQr386gHcIYM', // Replace with your Plant.id API key
        images: [image.path], // Adjust based on API requirements (e.g., base64)
      });

      const plantData = plantIdResponse.data;
      analysisResult = await processPlantData(plantData, latitude, longitude);
    } else if (plantName) {
      // Use Trefle API for text-based plant search
      const trefleResponse = await axios.get(`https://trefle.io/api/v1/plants/search?token=Gmfe32z-bAhZewOoh2HCQUIqIco2HFQTQr386gHcIYM&q=${plantName}`);
      analysisResult = await processPlantData(trefleResponse.data, latitude, longitude);
    } else {
      return res.status(400).json({ message: 'Please provide a plant name or image' });
    }

    res.json(analysisResult);
  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({ message: 'Failed to analyze plant' });
  }
});

// Helper function to process plant data
async function processPlantData(data, latitude, longitude) {
  // Customize this based on your API response structure
  return {
    plantName: data.name || 'Unknown',
    scientificName: data.scientific_name || 'N/A',
    growthConditions: 'Suitable for warm climates', // Placeholder
    harvestDays: 90, // Placeholder
    diseases: ['Powdery Mildew'], // Placeholder
    medicines: [{ name: 'Fungicide X', locationAdvice: 'Apply to leaves' }],
  };
}

module.exports = router;