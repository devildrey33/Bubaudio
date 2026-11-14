import fullscreen    from "./fullscreen.vert?raw";

import plasma        from "./plasma.frag?raw";
import tunnel        from "./tunnel.frag?raw";
import spiral        from "./spiral.frag?raw";
import galaxy        from "./galaxy.frag?raw";
import dualoscy      from "./dualoscy.frag?raw";
import liquidorb     from "./liquidorb.frag?raw";
import barras        from "./barras.frag?raw";
import livingorb     from "./livingorb.frag?raw";
import livingorb2    from "./livingorb2.frag?raw";
import dualwaveform  from "./dualwaveform.frag?raw";
import digitalocean  from "./digitalocean.frag?raw";
import digitalocean2 from "./digitalocean2.frag?raw";
import krustyrobots  from "./krustyrobots.frag?raw";
import krustyrl      from "./krustyrl.frag?raw";
import freshquagga   from "./freshquagga.frag?raw";



const shaders = [
    { name : "DigitalOcean2",fragment : digitalocean2 },
    { name : "Barras",       fragment : barras       },
    { name : "Spiral",       fragment : spiral       },
    { name : "Galaxy",       fragment : galaxy       },
    { name : "Dual Oscy",    fragment : dualoscy     },
    { name : "Liquid Orb",   fragment : liquidorb    },
    { name : "Living Orb",   fragment : livingorb    },
    { name : "Living Orb 2", fragment : livingorb2   },
    { name : "Dual Wave",    fragment : dualwaveform },
    { name : "DigitalOcean", fragment : digitalocean },
    { name : "Plasma",       fragment : plasma       },
    { name : "Tunnel",       fragment : tunnel       },
    { name : "krustyrobots", fragment : krustyrobots },
    { name : "krustyrl",     fragment : krustyrl },
    { name : "freshquagga",  fragment : freshquagga },
];

export default {
    fullscreen,
    shaders
};