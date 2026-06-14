'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

export async function getBans() {
  try {
    const bans = await prisma.ban.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return { success: true, bans };
  } catch (error: any) {
    console.error('Failed to get bans:', error);
    return { success: false, error: error.message };
  }
}

export async function createBan(formData: FormData) {
  try {
    const ip = formData.get('ip') as string | null;
    const mac = formData.get('mac') as string | null;
    const reason = formData.get('reason') as string;

    if (!ip && !mac) {
      return { success: false, error: 'Must provide either IP or MAC address' };
    }
    if (!reason) {
      return { success: false, error: 'Reason is required' };
    }

    const data: any = { reason };
    if (ip) data.ip = ip;
    if (mac) data.mac = mac.toUpperCase();

    const ban = await prisma.ban.create({
      data,
    });

    revalidatePath('/admin/bans');
    return { success: true, ban };
  } catch (error: any) {
    console.error('Failed to create ban:', error);
    if (error.code === 'P2002') {
      return { success: false, error: 'This IP or MAC is already banned' };
    }
    return { success: false, error: error.message };
  }
}

export async function deleteBan(id: number) {
  try {
    await prisma.ban.delete({
      where: { id },
    });
    revalidatePath('/admin/bans');
    return { success: true };
  } catch (error: any) {
    console.error('Failed to delete ban:', error);
    return { success: false, error: error.message };
  }
}

export async function banPlayer(mac: string, ip: string, reason: string = 'Banned by Admin') {
  if (!mac && !ip) return { success: false, error: 'MAC or IP required' };
  
  try {
      const { kickPlayer } = await import('./serverControls');
      
      // 1. Add to Ban table
      await prisma.ban.create({
          data: {
              mac: mac || null,
              ip: ip || null,
              reason: reason
          }
      });
      
      // 2. Kick the player immediately so they disconnect
      if (mac) {
          await kickPlayer(mac);
      }
      
      revalidatePath('/admin/bans');
      return { success: true };
  } catch (e: any) {
      if (e.code === 'P2002') {
        return { success: false, error: 'This IP or MAC is already banned' };
      }
      return { success: false, error: e.message };
  }
}
