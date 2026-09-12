require('dotenv').config();
const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  title: String,
  description: String,
  price: Number,
  discount: Number,
  shippingFee: { type: Number, default: 0 },
  stock: { type: Number, default: 10 },
  sold: { type: Number, default: 0 },
  weight: { type: String, default: '' },
  images: [String],
  video: String
});

const Product = mongoose.model('Product', productSchema);

const sampleProducts = [
  {
    title: "Audionic Airbud 425 TWS Wireless Earbuds",
    description: "Experience crystal clear audio, ultra-low latency gaming mode, and up to 30 hours of playtime with fast Type-C charging.",
    price: 4999,
    discount: 20,
    shippingFee: 0,
    stock: 25,
    sold: 14,
    weight: "0.2kg",
    images: [
      "uploads/1764950697846-Audionic Airpods.jpeg",
      "uploads/1764950697884-audionic-the-sound-master-black-airbud-425-tws-earbuds-3577564092841.jpeg",
      "uploads/1764950697892-audionic-the-sound-master-black-airbud-425-tws-earbuds-35775641125020.jpeg",
      "uploads/1764950697893-audionic-the-sound-master-black-airbud-425-tws-earbuds-35775641288860.jpeg"
    ]
  },
  {
    title: "Audionic Airbud 495 ANC Pro Earbuds",
    description: "Active Noise Cancellation (ANC) with Environmental Noise Cancellation (ENC) for ultra-clear calls and immersive bass sound.",
    price: 6499,
    discount: 15,
    shippingFee: 0,
    stock: 18,
    sold: 22,
    weight: "0.25kg",
    images: [
      "uploads/1765984143332-Airbud495-Image-4.jpeg",
      "uploads/1765984143351-Airbud495-Image-1.jpeg",
      "uploads/1765984143368-Airbud495-Image-2.jpeg"
    ]
  },
  {
    title: "Audionic Flair Wireless Bluetooth Neckband",
    description: "Long-lasting battery life with dynamic bass drivers, magnetic earbuds, and comfortable ergonomic neckband design.",
    price: 3499,
    discount: 10,
    shippingFee: 150,
    stock: 30,
    sold: 8,
    weight: "0.15kg",
    images: [
      "uploads/1764953667164-Flair_Carbon_4.png",
      "uploads/1764953667170-Flair_Beige_4.png",
      "uploads/1764953667175-Flair_IceBlue_2.png"
    ]
  },
  {
    title: "Audionic Ignite Smartwatch HD Touch Display",
    description: "Smart fitness tracker with heart rate monitor, SpO2 sensor, multiple sports modes, Bluetooth calling, and water resistance.",
    price: 7999,
    discount: 25,
    shippingFee: 0,
    stock: 12,
    sold: 19,
    weight: "0.3kg",
    images: [
      "uploads/1764954166553-ignite-black-02.png",
      "uploads/1764953797785-BUDRENDER33.png"
    ]
  },
  {
    title: "Premium Studio Wireless Hi-Fi Headphones",
    description: "Deep bass, soft memory-foam ear cushions, foldable design, and 40-hour battery life for studio-grade audio experience.",
    price: 8999,
    discount: 30,
    shippingFee: 0,
    stock: 15,
    sold: 31,
    weight: "0.45kg",
    images: [
      "uploads/1764953366227-Ecommerce-Image-1_3.jpeg",
      "uploads/1764953366239-Ecommerce-Image-1_1.jpeg",
      "uploads/1764953366253-Ecommerce-Image-1.jpeg"
    ]
  }
];

async function seed() {
  const dbURI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/zmah_technologies';
  console.log('Connecting to:', dbURI);
  await mongoose.connect(dbURI);
  console.log('Connected to MongoDB!');
  
  const count = await Product.countDocuments();
  if (count === 0) {
    await Product.insertMany(sampleProducts);
    console.log(`Successfully seeded ${sampleProducts.length} sample products!`);
  } else {
    console.log(`Database already has ${count} products.`);
  }
  process.exit(0);
}

seed().catch(err => {
  console.error('Seed error:', err.message);
  process.exit(1);
});
