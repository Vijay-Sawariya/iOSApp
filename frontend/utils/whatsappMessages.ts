import { Alert, Linking } from 'react-native';

const safeText = (value: any) => (value === null || value === undefined ? '' : String(value).trim());

export const getWhatsappGreeting = () => {
  const hour = new Date().getHours();
  if (hour >= 17) return 'Good Evening';
  if (hour >= 12) return 'Good Afternoon';
  return 'Good Morning';
};

export const normalizeWhatsappPhone = (phone: string | null | undefined) => {
  const digits = safeText(phone).replace(/[^0-9]/g, '');
  if (!digits) return '';
  if (digits.length === 10) return `91${digits}`;
  return digits;
};

export const openWhatsapp = async (phone: string | null | undefined, message: string) => {
  const normalizedPhone = normalizeWhatsappPhone(phone);
  if (!normalizedPhone) {
    Alert.alert('WhatsApp', 'Phone number is missing.');
    return;
  }
  const url = `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message)}`;
  const canOpen = await Linking.canOpenURL(url);
  if (!canOpen) {
    Alert.alert('WhatsApp', 'WhatsApp is not available on this device.');
    return;
  }
  Linking.openURL(url);
};

export const buildBuyerFollowupMessage = (senderName?: string | null) => {
  const greeting = getWhatsappGreeting();
  const name = safeText(senderName) || 'Team';
  return `*Hi Sir, ${greeting}*

Have you already finalised a property or still exploring?
I've got some excellent new options available. Please let me know if there have been any changes in your requirements or budget, so I can share the most relevant choices with you.

Warm Regards
${name}
Sagar Home Developers`;
};

const getShortPropertyTitle = (property: any) => {
  const address = safeText(property.address || property.property_address);
  const location = safeText(property.location || property.property_location);
  if (address && location) return `${address}, ${location}`;
  return address || location || safeText(property.name || property.property_name) || `Lead ${property.id || property.property_id || ''}`;
};

const formatPrice = (property: any) => {
  const unit = safeText(property.unit || property.property_unit || 'CR').toUpperCase();
  const unitLabel = unit === 'L' ? 'Lac' : unit === 'K' ? 'Th' : 'Cr';
  const floorPricing = property.floor_pricing || [];
  if (Array.isArray(floorPricing) && floorPricing.length > 0) {
    return floorPricing
      .map((row: any) => `${safeText(row.floor_label)}: Rs. ${safeText(row.floor_amount)} ${unitLabel}`)
      .join(' | ');
  }
  const max = safeText(property.budget_max || property.property_budget_max);
  const min = safeText(property.budget_min || property.property_budget_min);
  if (min && max && min !== max) return `Rs. ${min} - ${max} ${unitLabel}`;
  if (max) return `Rs. ${max} ${unitLabel}`;
  if (min) return `Rs. ${min} ${unitLabel}`;
  return 'On request';
};

export const buildInventoryDetailsMessage = (property: any) => {
  const greeting = getWhatsappGreeting();
  let message = `*Hi Sir, ${greeting}*

I am sharing a few premium residences with you that might be of interest. These homes offer good privacy, elegant design, and are in a prime neighbourhood.

`;

  const locationLine = [safeText(property.address || property.property_address), safeText(property.location || property.property_location)]
    .filter(Boolean)
    .join(', ');
  if (locationLine) message += `Location: ${locationLine}\n`;
  if (property.area_size || property.property_size) message += `Plot Area: ${safeText(property.area_size || property.property_size)} sq. yds\n`;
  if (property.building_facing) message += `Plot Facing: ${safeText(property.building_facing)}\n`;
  if (property.floor || property.property_floor || property.bhk || property.property_bhk || property.car_parking_number) {
    message += `Floor: ${safeText(property.floor || property.property_floor)} | Total BHKs: It has ${safeText(property.bhk || property.property_bhk)} | Parking: ${safeText(property.car_parking_number)} cars parking available\n`;
  }
  if (property.lead_status || property.property_status) message += `Development Status: It is ${safeText(property.lead_status || property.property_status)} property\n`;
  if (property.possession_on) message += `Possession On: ${safeText(property.possession_on)}\n`;
  if (property.notes || property.property_notes) message += `Special Features: ${safeText(property.notes || property.property_notes)}\n`;
  message += `Asking Price: ${formatPrice(property)} (Negotiable)`;

  return message;
};

export const buildSelectedInventoryMessage = (properties: any[]) => {
  const greeting = getWhatsappGreeting();
  const count = properties.length;
  const introText = count === 1 ? 'a premium option' : count > 2 ? 'a few premium options' : 'a couple of premium options';
  let message = `${greeting},
I hope you are doing well.
Following our recent discussion, I am sharing ${introText} in your preferred location that closely match your requirements.

Property details:

`;

  properties.forEach((property, index) => {
    const title = getShortPropertyTitle(property);
    const status = safeText(property.lead_status || property.property_status);
    message += `Property ${index + 1}(${property.id || property.property_id}) - ${title}${status ? ` (${status})` : ''}\n`;
    message += `- Plot Size: ${safeText(property.area_size || property.property_size) || 'NA'} sq. yds`;
    if (property.floor || property.property_floor) message += ` | ${safeText(property.floor || property.property_floor)}`;
    message += '\n';
    if (property.bhk || property.property_bhk) message += `- Configuration: ${safeText(property.bhk || property.property_bhk)}\n`;
    if (property.car_parking_number) message += `- Parking: ${safeText(property.car_parking_number)} Cars\n`;
    if (property.possession_on) {
      message += `- Possession: ${safeText(property.possession_on)}\n`;
    } else if (property.notes || property.property_notes) {
      message += `- Status: ${safeText(property.notes || property.property_notes)}\n`;
    } else if (property.building_facing) {
      message += `- Facing: ${safeText(property.building_facing)}\n`;
    }
    message += `- Price: ${formatPrice(property)}\n\n`;
  });

  message += `${count > 1 ? 'These options offer' : 'This option offers'} excellent location advantage, privacy, and a premium living environment.\n`;
  message += 'If any of these align with your requirement, I would be happy to arrange a private viewing at your convenience.\n';
  message += 'Looking forward to your feedback.';
  return message;
};
