# Wind Go / No-Go — Grove Method (Imperial)

Static HTML/JS tool for quick GO/NO-GO based on the Grove wind method shown in the operator manual photos.

Assumptions locked:
- Main boom only
- Fully extended outriggers
- No jib
- Full counterweight

Implements:
- Boom-tip 3-second gust conversion: V(z) = [ (Z/33)^0.14 + 0.4 ] * V (mph)
- 30 < V(z) <= 45 mph capacity reduction factors by boom length
- Awr(load) = Ap * Cd
- Awr(allow) = 0.0059 * m(allow)
- Table 2-3 (Imperial) to compute max permissible wind when ratio > 1

## Run
Open `index.html` in any browser.

## Notes
- Enter *Published rated capacity* from the correct load chart line for your exact pick.
- Default Cd uses the max of the range (conservative).
- Default projected area uses worst-case broadside.
