ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'publicada';
ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS sincronizado boolean NOT NULL DEFAULT true;