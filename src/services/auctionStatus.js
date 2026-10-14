// Single source of truth for "what status is this auction right now".
// Both the lazy-close-on-read path and the cron job use this so the
// two never disagree.
function computeStatus(auction, now = new Date()) {
  if (auction.status === 'ended') return 'ended';
  if (now < auction.startTime) return 'upcoming';
  if (now >= auction.endTime) return 'ended';
  return 'live';
}

module.exports = { computeStatus };
