
import { Router, RequestHandler } from 'express';
import mongoose from 'mongoose';

import Pharmacy, { IPharmacy } from '../models/Pharmacy';
import type { PublicPharmacyDTO } from '../dto/community.dto';

const router = Router();

// Only approved, active, publicly visible pharmacies.
const publicVisibilityFilter = {
  status: 'ACTIVE' as const,
  isPubliclyVisible: true,
  publicApprovedAt: { $type: 'date' as const }
};

// Explicit allowlist: never return the full pharmacy document.
const publicFields = [
  '_id',
  'name',
  'address',
  'city',
  'district',
  'contactNumber',
  'openingHours'
].join(' ');

type PublicPharmacyRecord = {
  _id: mongoose.Types.ObjectId;
  name: string;
  address: string;
  city?: string;
  district?: string;
  contactNumber?: string;
  openingHours?: unknown[];
};

const toPublicDTO = (
  pharmacy: PublicPharmacyRecord
): PublicPharmacyDTO => ({
  id: String(pharmacy._id),
  pharmacyName: pharmacy.name,
  address: pharmacy.address,
  city: pharmacy.city ?? '',
  district: pharmacy.district ?? '',
  ...(pharmacy.contactNumber
    ? { phone: pharmacy.contactNumber }
    : {}),
  ...(pharmacy.openingHours
    ? { openingHours: pharmacy.openingHours }
    : {})
});

// GET /api/v1/public/pharmacies?area=Kandy
const getPublicPharmacies: RequestHandler = async (req, res) => {
  try {
    if (
      req.query.area !== undefined &&
      (typeof req.query.area !== 'string' ||
        req.query.area.length > 100)
    ) {
      res.status(400).json({
        success: false,
        message: 'Invalid area parameter'
      });
      return;
    }

    const area = typeof req.query.area === 'string'
      ? req.query.area.trim()
      : '';

    const filter: Record<string, unknown> = {
      ...publicVisibilityFilter
    };

    if (area) {
      // Case-insensitive exact matching avoids regex injection.
      filter.$or = [
        { city: new RegExp(`^${escapeRegex(area)}$`, 'i') },
        { district: new RegExp(`^${escapeRegex(area)}$`, 'i') }
      ];
    }

    const pharmacies = await Pharmacy.find(filter)
      .select(publicFields)
      .sort({ name: 1, _id: 1 })
      .limit(100)
      .lean<PublicPharmacyRecord[]>();

    res.status(200).json({
      success: true,
      data: pharmacies.map(toPublicDTO)
    });
  } catch (error) {
    console.error('Public pharmacy directory error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve public pharmacies'
    });
  }
};

// GET /api/v1/public/pharmacies/:id
const getPublicPharmacyById: RequestHandler = async (req, res) => {
  try {
    const pharmacyId = String(req.params.id);

    if (!mongoose.isValidObjectId(pharmacyId)) {
      res.status(400).json({
        success: false,
        message: 'Invalid pharmacy ID'
      });
      return;
    }

    const pharmacy = await Pharmacy.findOne({
      _id: pharmacyId,
      ...publicVisibilityFilter
    })
      .select(publicFields)
      .lean<PublicPharmacyRecord | null>();

    if (!pharmacy) {
      res.status(404).json({
        success: false,
        message: 'Public pharmacy not found'
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: toPublicDTO(pharmacy)
    });
  } catch (error) {
    console.error('Public pharmacy details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve pharmacy details'
    });
  }
};

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

router.get('/', getPublicPharmacies);
router.get('/:id', getPublicPharmacyById);

export default router;
