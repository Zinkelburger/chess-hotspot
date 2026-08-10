#!/usr/bin/env python3
"""Apply researched addresses to spots.v1.json."""
import json

INPUT = "public/spots.v1.json"

ADDRESSES = {
    # Batch 1
    "retiro_madrid": "P.º de Cuba, 6, Parque del Retiro, 28009 Madrid, Spain",
    "tanner_coffee_la": "4342 Sepulveda Blvd, Culver City, CA 90230",
    "andover_adult_chess": "Oak & Iron Brewing Co., 18 Red Spring Rd, Andover, MA 01810",
    "alaska_arctic_chess_club": "Noel Wien Library, 1215 Cowles St, Fairbanks, AK 99701",
    "auburn_chess_club": "Missions Coffee, 2405 Grass Valley Hwy, Auburn, CA 95603",
    "bay_area_chess": "2050 Concourse Dr #42, San Jose, CA 95131",
    "kings_of_chess": "Tallyn's Reach Library, 23911 E Arapahoe Rd, Aurora, CO 80016",
    "the_king_s_dambit": "Denver Metro Bridge Studio, 685 Cherry St, Denver, CO 80220",
    "32_pieces": "New Canaan Library, 151 Main St, New Canaan, CT 06840",
    "charter_oak_chess_club": "Mark Twain Library, 439 Redding Rd, Redding, CT 06896",
    "hamden_chess_club": "Play More Chess Academy, 1227 Whitney Ave, Hamden, CT 06518",
    "waterbury_chess_club": "Mattatuck Museum, 144 W Main St, Waterbury, CT 06702",
    "milford_chess_club": "Margaret Egan Center, 35 Matthew St, Milford, CT 06460",
    "capital_city_chess_club": "The Outlets of Mississippi, 200 Bass Pro Dr, Pearl, MS 39208",
    "central_florida_chess_club": "Holiday Inn Resort, 13351 State Rd 535, Orlando, FL 32821",
    "gator_chess_club": "Reitz Union, 655 Reitz Union Dr, Gainesville, FL 32611",
    "championship_chess": "3565 Evans Rd, Atlanta, GA 30340",
    "winterville_chess_club": "Winterville Cultural Center, 371 N Church St, Winterville, GA 30683",
    "chicago_chess_club": "Gracias Maria, 1850 S Blue Island Ave, Chicago, IL 60608",
    "mchenry_county_chess_club": "McHenry County College, 8900 US Hwy 14, Crystal Lake, IL 60012",
    "springfield_chess_club": "White Oaks Mall, 2501 Wabash Ave, Springfield, IL 62704",
    "twin_city_chess_club": "Portillo's, 202 Landmark Dr, Normal, IL 61761",
    "circle_city_chess": "Moonshot Games, 881 Massachusetts Ave, Indianapolis, IN 46204",
    "joepye_chess_club": "Goshen Public Library, 601 S 5th St, Goshen, IN 46526",

    # Batch 2
    "summit_chess_club": "75 Maple St, Summit, NJ 07901",
    "cedar_rapids_chess_club": "Cedar Rapids Public Library, 450 5th Ave SE, Cedar Rapids, IA 52401",
    "hub_city_chess_club": "Belen Public Library, 333 Becker Ave, Belen, NM 87002",
    "the_west_louisville_chess_club": "Shawnee Library, 3912 W Broadway, Louisville, KY 40211",
    "baton_rouge_chess_club": "Jones Creek Regional Branch Library, 6222 Jones Creek Rd, Baton Rouge, LA 70817",
    "emmorton_chess_club": "2213 Old Emmorton Rd, Bel Air, MD 21015",
    "howard_county_chess_club": "Johns Hopkins APL, 11100 Johns Hopkins Rd, Laurel, MD 20723",
    "north_harford_chess_club": "North Harford Middle School, 112 Pylesville Rd, Pylesville, MD 21132",
    "the_south_shore_chess_club": "18 Spear St, Quincy, MA 02169",
    "implodians_chess": "Flint Public Library, 1026 E Kearsley St, Flint, MI 48503",
    "loomis_chess_club": "Loomis Library, 6050 Library Dr, Loomis, CA 95650",
    "south_lyon_chess_club": "Salem South Lyon District Library, 9800 Pontiac Trail, South Lyon, MI 48178",
    "saint_cloud_chess_club": "1527 Northway Dr, St. Cloud, MN 56303",
    "st_croix_valley_chess_club": "Stillwater Public Library, 224 3rd St N, Stillwater, MN 55082",
    "oxford_chess_club": "Growler on the Square, 265 N Lamar Blvd, Suite Y, Oxford, MS 38655",
    "scott_county_chess_club": "Forest Public Library, 210 S Raleigh St, Forest, MS 39074",
    "wise_chess": "6505 Getwell Rd, Southaven, MS 38672",
    "314_chess": "Richmond Heights Library, 8001 Dale Ave, Richmond Heights, MO 63117",
    "westside_lake_of_the_ozarks_chess_club": "Morgan County Library, 600 N Hunter St, Versailles, MO 65084",
    "cape_may_county_chess_club": "Lower Township Rec Center, 2600 Bayshore Rd, Villas, NJ 08251",
    "hamilton_chess_club": "Switlik Park Pavilion, 55 Fisher Pl, Hamilton Township, NJ 08620",
    "lumen_strategy_club": "101 Crawfords Corner Rd, Suite 2110, Holmdel, NJ 07733",
    "pequannock_chess_club": "477 Newark Pompton Tpke, Pompton Plains, NJ 07444",
    "santa_fe_rooks_a6034880": "DeVargas Center, 564 N Guadalupe St, Santa Fe, NM 87501",
    "chessanity": "George A. Jackson Elementary School, 58 Maytime Dr, Jericho, NY 11753",
    "middletown_chess_club": "Wallkill Community Center, 8 Wes Warren Dr, Middletown, NY 10941",
    "knights_chess_club": "13740 Old St Augustine Rd, Jacksonville, FL 32258",
    "new_bern_chess_club": "2002 S Glenburnie Rd, New Bern, NC 28562",

    # Batch 3
    "queen_club": "14045 Ballantyne Corporate Pl, Suite 101, Charlotte, NC 28277",
    "smoky_mountain_chess_club": "428 Hazelwood Ave, Waynesville, NC 28786",
    "delta_alpha_lambda_chapter": "Cuyahoga Community College Metro Campus, 2900 Community College Ave, Cleveland, OH 44115",
    "granville_newark_new_albany_chess_club": "Trek Brewing, 1486 Granville Rd, Newark, OH 43055",
    "jackson_chess_club": "999 Vann Drive, Jackson, TN 38305",
    "marysville_chess_club": "15701 US Highway 36, Marysville, OH 43040",
    "parma_chess_club": "7863 York Rd, Parma, OH 44130",
    "chessmates_okc": "10 NE 10th St, Suite 202, Oklahoma City, OK 73104",
    "rose_city_chess": "4525 SW California St, Unit 304, Portland, OR 97219",
    "salem_oregon_chess": "The Yard Food Park, 4106 State St, Salem, OR 97301",
    "cpa_chess": "St. George's Church, 1 W Ardmore Ave, Ardmore, PA 19003",
    "erie_chess_club": "Gannon University Palumbo Academic Center, 109 University Square, Erie, PA 16541",
    "harrisburg_west_shore_cc": "Camp Hill Giant Community Center, 3301 Trindle Rd, Camp Hill, PA 17011",
    "pittsburgh_chess_club_inc": "5869 Forbes Ave, Pittsburgh, PA 15217",
    "beaufort_chess": "Henry C Chambers Waterfront Park, 103 Charles St, Beaufort, SC 29902",
    "cumberland_county_chess_club": "352 Devers St, Fayetteville, NC 28303",
    "tri_cities_chess_club": "Concordia Lutheran Church, 725 Truxton Dr, Kingsport, TN 37660",
    "wilco_chess_club": "Georgetown Public Library, 303 Main St, Georgetown, TX 78626",
    "arlington_chess_club": "J. Gilligan's, 400 E Abram St, Arlington, TX 76010",
    "bkmv_chess_club": "Seaview Jewish Center, 1585 E 98th St, Brooklyn, NY 11236",
    "dark_knights_chess_club": "120 N 10th St, Suite 203, McAllen, TX 78501",
    "lufkin_piney_woods_chess_center": "123 S 1st St, Suite A, Lufkin, TX 75902",
    "utah_valley_south_chess_club": "Payson City Library, 66 S Main St, Payson, UT 84651",
    "dahlgren_sea_kings_chess_club": "Dahlgren General Library, 6090 Jenkins Rd, Dahlgren, VA 22448",
    "rva_pieces": "GWARbar, 217 W Clay St, Richmond, VA 23220",

    # Batch 4
    "blitz_and_blunders": "25 E 3rd Ave, Spokane, WA 99202",
    "evergreen_chess_club": "22505 WA-9, Woodinville, WA 98072",
    "olympia_chess_club": "The Olympia Center, 222 Columbia St NW, Olympia, WA 98501",
    "snoqualmie_valley_chess_club": "2550 NE Park Dr, Issaquah, WA 98029",
    "judgement_day": "15500 Sand Canyon Ave, Irvine, CA 92618",
    "oakmont_chess_club": "Oakmont Carnegie Library, 700 Allegheny River Blvd, Oakmont, PA 15139",
    "san_luis_obispo_chess_club": "Whole Foods, 1531 Froom Ranch Way, San Luis Obispo, CA 93405",
    "ynk_chess": "18181 Imperial Hwy, Yorba Linda, CA 92886",
    "oak_grove_gracenotes_chess_club": "Grace Notes, 1093 W Orange Blossom Trl, Apopka, FL 32712",
    "palatka_chess_club": "Jenkins Community Center, 1100 N 19th St, Palatka, FL 32177",
    "pensacola_chess_club": "Books-A-Million, 6235 N Davis Hwy, Pensacola, FL 32504",
    "syracuse_community_chess_club": "Liverpool Public Library, 310 Tulip St, Liverpool, NY 13088",
    "the_villages_chess_club": "850 Kristine Way, The Villages, FL 32163",
    "oakalla_library_chess_club": "Oakalla Public Library, 29011 FM 963, Oakalla, TX 78608",
    "south_texas_elite_chess_club": "5901 McPherson Rd STE 16A, Laredo, TX 78041",
    "tarrant_county_chess_club": "9015 Grand Ave, North Richland Hills, TX 76180",
    "win_or_learn_chess_club": "8637 Spicewood Springs Rd, Austin, TX 78759",
}

def main():
    with open(INPUT) as f:
        spots = json.load(f)

    updated = 0
    not_found_ids = []

    spot_map = {s["id"]: s for s in spots}

    for sid, addr in ADDRESSES.items():
        if sid in spot_map:
            spot_map[sid]["address"] = addr
            updated += 1
            print(f"  SET {sid}: {addr}")
        else:
            print(f"  WARN: {sid} not found in spots!")

    # Count how many of the 122 still have no real address
    all_122_ids = set()
    for batch_file in ["/tmp/research_batch_1.json", "/tmp/research_batch_2.json",
                       "/tmp/research_batch_3.json", "/tmp/research_batch_4.json"]:
        with open(batch_file) as f:
            for entry in json.load(f):
                all_122_ids.add(entry["id"])

    still_missing = []
    for sid in all_122_ids:
        if sid not in ADDRESSES and sid in spot_map:
            still_missing.append(sid)

    print(f"\n--- Summary ---")
    print(f"Updated: {updated}")
    print(f"Still missing address ({len(still_missing)}):")
    for sid in sorted(still_missing):
        s = spot_map[sid]
        print(f"  {sid}: {s.get('name')} ({s.get('city', '?')}, {s.get('state', '?')})")

    with open(INPUT, "w") as f:
        json.dump(spots, f, indent=2, ensure_ascii=False)

    print(f"\nWrote {INPUT}")

if __name__ == "__main__":
    main()
