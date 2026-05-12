-- Migration v14: Add image_url field to strategy_details for storing build guide images

ALTER TABLE strategy_details ADD COLUMN image_url TEXT DEFAULT '';