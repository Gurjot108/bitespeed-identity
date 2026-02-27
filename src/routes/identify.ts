// src/routes/identify.ts
import { Router, Request, Response } from 'express';
import { prisma } from '../db';

const router = Router();

router.post('/', async (req: Request, res: Response): Promise<any> => {
  try {
    let { email, phoneNumber } = req.body;

    if (phoneNumber) phoneNumber = phoneNumber.toString();
    
    if (!email && !phoneNumber) {
      return res.status(400).json({ error: "Please provide an email or phoneNumber." });
    }

    // --- STEP 1: Find any existing contacts ---
    const directMatches = await prisma.contact.findMany({
      where: {
        OR: [
          { email: email || undefined },
          { phoneNumber: phoneNumber || undefined }
        ]
      }
    });

    // --- SCENARIO 1: Brand New Customer ---
    if (directMatches.length === 0) {
      const newContact = await prisma.contact.create({
        data: {
          email: email || null,
          phoneNumber: phoneNumber || null,
          linkPrecedence: 'primary'
        }
      });

      return res.status(200).json({
        contact: {
          primaryContactId: newContact.id,
          emails: newContact.email ? [newContact.email] : [],
          phoneNumbers: newContact.phoneNumber ? [newContact.phoneNumber] : [],
          secondaryContactIds: []
        }
      });
    }

    // --- STEP 2: Find the entire Cluster ---
    const primaryIds = new Set<number>();
    for (const match of directMatches) {
      if (match.linkPrecedence === 'primary') {
        primaryIds.add(match.id);
      } else if (match.linkedId) {
        primaryIds.add(match.linkedId);
      }
    }

    let allLinkedContacts = await prisma.contact.findMany({
      where: {
        OR: [
          { id: { in: Array.from(primaryIds) } },
          { linkedId: { in: Array.from(primaryIds) } }
        ]
      },
      orderBy: { createdAt: 'asc' }
    });

    // --- SCENARIO 3: Merging Multiple Primary Contacts ---
    const primaryContacts = allLinkedContacts.filter(c => c.linkPrecedence === 'primary');
    const rootPrimary = primaryContacts[0];

    if (primaryContacts.length > 1) {
      const secondaryPrimaries = primaryContacts.slice(1);
      const idsToDemote = secondaryPrimaries.map(c => c.id);

      await prisma.contact.updateMany({
        where: { id: { in: idsToDemote } },
        data: {
          linkPrecedence: 'secondary',
          linkedId: rootPrimary.id,
          updatedAt: new Date()
        }
      });

      await prisma.contact.updateMany({
        where: { linkedId: { in: idsToDemote } },
        data: {
          linkedId: rootPrimary.id,
          updatedAt: new Date()
        }
      });

      allLinkedContacts = await prisma.contact.findMany({
        where: {
          OR: [
            { id: rootPrimary.id },
            { linkedId: rootPrimary.id }
          ]
        },
        orderBy: { createdAt: 'asc' }
      });
    }

    // --- SCENARIO 2: Existing Customer with New Info ---
    const clusterEmails = new Set(allLinkedContacts.map(c => c.email).filter(Boolean));
    const clusterPhones = new Set(allLinkedContacts.map(c => c.phoneNumber).filter(Boolean));

    const isNewEmail = email && !clusterEmails.has(email);
    const isNewPhone = phoneNumber && !clusterPhones.has(phoneNumber);

    if (isNewEmail || isNewPhone) {
      const newSecondary = await prisma.contact.create({
        data: {
          email: email || null,
          phoneNumber: phoneNumber || null,
          linkedId: rootPrimary.id,
          linkPrecedence: 'secondary'
        }
      });
      allLinkedContacts.push(newSecondary);
    }

    // --- STEP 3: Construct the Golden Record ---
    const emailsArray = Array.from(new Set(allLinkedContacts.map(c => c.email).filter(Boolean))) as string[];
    const phonesArray = Array.from(new Set(allLinkedContacts.map(c => c.phoneNumber).filter(Boolean))) as string[];
    
    if (rootPrimary.email && emailsArray[0] !== rootPrimary.email) {
      const idx = emailsArray.indexOf(rootPrimary.email);
      if(idx > -1) { emailsArray.splice(idx, 1); emailsArray.unshift(rootPrimary.email); }
    }
    if (rootPrimary.phoneNumber && phonesArray[0] !== rootPrimary.phoneNumber) {
      const idx = phonesArray.indexOf(rootPrimary.phoneNumber);
      if(idx > -1) { phonesArray.splice(idx, 1); phonesArray.unshift(rootPrimary.phoneNumber); }
    }

    const secondaryContactIds = allLinkedContacts
        .filter(c => c.id !== rootPrimary.id)
        .map(c => c.id);

    return res.status(200).json({
      contact: {
        primaryContactId: rootPrimary.id,
        emails: emailsArray,
        phoneNumbers: phonesArray,
        secondaryContactIds
      }
    });

  } catch (error) {
    console.error("Error in /identify:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;