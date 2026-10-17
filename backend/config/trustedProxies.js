const { BlockList, isIP } = require('node:net');

// Only explicit IPs/CIDRs are accepted; never trust arbitrary forwarded headers.
function trustedProxies(value = process.env.TRUSTED_PROXY_CIDRS || '') {
  if (!value.trim()) return false;
  const allowed = new BlockList();
  for (const entry of value.split(',').map(part => part.trim())) {
    const [address, prefix, extra] = entry.split('/');
    const family = isIP(address);
    const bits = family === 4 ? 32 : 128;
    if (!family || extra !== undefined || (prefix !== undefined &&
      (!/^\d+$/.test(prefix) || Number(prefix) < 1 || Number(prefix) > bits))) {
      throw new Error('TRUSTED_PROXY_CIDRS harus berisi IP atau CIDR proxy tepercaya; wildcard dan /0 tidak diizinkan.');
    }
    const type = family === 4 ? 'ipv4' : 'ipv6';
    if (prefix === undefined) allowed.addAddress(address, type);
    else allowed.addSubnet(address, Number(prefix), type);
  }
  return address => {
    const family = isIP(address);
    return family !== 0 && allowed.check(address, family === 4 ? 'ipv4' : 'ipv6');
  };
}

module.exports = trustedProxies;
