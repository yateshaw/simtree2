import express, { Request, Response } from 'express';
import { storage } from '../storage';
import { z } from 'zod';
import { db } from '../db';
import { eq } from 'drizzle-orm';
import * as schema from '@shared/schema';
import { sendVerificationEmail } from '../services/email.service';
import crypto from 'crypto';
import { getBaseUrl } from '../env';

const router = express.Router();

// Resend verification email
router.post('/resend-verification', async (req, res) => {
  try {
    const { email } = z.object({
      email: z.string().email()
    }).parse(req.body);

    console.log(`[Maintenance] Attempting to resend verification email for: ${email}`);

    // Check if user exists
    const user = await storage.getUserByEmail(email);
    
    if (!user) {
      console.log(`[Maintenance] No user found with email: ${email}`);
      return res.status(404).json({ 
        success: false, 
        message: 'No user found with this email address' 
      });
    }

    if (user.isVerified) {
      console.log(`[Maintenance] User ${email} is already verified`);
      return res.status(400).json({
        success: false,
        message: 'This account is already verified. Please try logging in.'
      });
    }

    // Generate a new verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    
    // Set token expiry to 24 hours from now
    const verificationTokenExpiry = new Date();
    verificationTokenExpiry.setHours(verificationTokenExpiry.getHours() + 24);

    // Update user with new verification token
    await db.update(schema.users)
      .set({
        verificationToken,
        verificationTokenExpiry: verificationTokenExpiry.toISOString()
      })
      .where(eq(schema.users.id, user.id));

    // Send verification email using getBaseUrl instead of request info
    const baseUrl = getBaseUrl();
    const setPasswordUrl = `${baseUrl}/set-password/${verificationToken}/${user.id}`;
    
    console.log(`[Maintenance] Sending verification email to ${email} with URL: ${setPasswordUrl} (Using base URL: ${baseUrl})`);
    const emailSent = await sendVerificationEmail(
      user.email, 
      user.username, 
      verificationToken, 
      setPasswordUrl
    );

    if (emailSent) {
      console.log(`[Maintenance] Verification email sent successfully to ${email}`);
      return res.json({ 
        success: true, 
        message: 'Verification email has been sent. Please check your inbox.' 
      });
    } else {
      console.error(`[Maintenance] Failed to send verification email to ${email}`);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to send verification email. Please try again later.' 
      });
    }
  } catch (error) {
    console.error('[Maintenance] Error in resend verification:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid email format', 
        errors: error.errors 
      });
    }
    return res.status(500).json({ 
      success: false, 
      message: 'An error occurred while processing your request' 
    });
  }
});

// Delete unverified user (allows re-registration)
router.post('/delete-unverified-user', async (req, res) => {
  try {
    const { email } = z.object({
      email: z.string().email()
    }).parse(req.body);

    console.log(`[Maintenance] Attempting to delete unverified user: ${email}`);

    // Check if user exists
    const user = await storage.getUserByEmail(email);
    
    if (!user) {
      console.log(`[Maintenance] No user found with email: ${email}`);
      return res.status(404).json({ 
        success: false, 
        message: 'No user found with this email address' 
      });
    }

    if (user.isVerified) {
      console.log(`[Maintenance] Cannot delete verified user ${email}`);
      return res.status(400).json({
        success: false,
        message: 'Cannot delete a verified account. Please contact support for assistance.'
      });
    }

    // Delete the unverified user
    await db.delete(schema.users)
      .where(eq(schema.users.id, user.id));

    console.log(`[Maintenance] Successfully deleted unverified user: ${email} (ID: ${user.id})`);
    return res.json({ 
      success: true, 
      message: 'Unverified account deleted. You can now register again with this email.' 
    });
  } catch (error) {
    console.error('[Maintenance] Error in delete unverified user:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid email format', 
        errors: error.errors 
      });
    }
    return res.status(500).json({ 
      success: false, 
      message: 'An error occurred while processing your request' 
    });
  }
});

export default router;