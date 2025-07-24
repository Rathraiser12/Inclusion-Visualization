### Test run
- npm run dev
- need to remove the cdn and use the tailwind plugin for production 
### Bugs and Features
- For the case of lambda=-1 and beta =pi/4 the visuzlation doesnt show any place with red where the it is maximum (check color plotting with tauxy maybe error in web gl integration) (check the new formual again for tou and confirm the derivation )


- lambda 0 and beta 45 txy case, the points location
- changing beta values causes the min max dots to move further
- The visualization is correct the dots are not being roperly places:
    two possible areas:
    - conversion form pixel to ndc to csss
    - or the indexing system logic for min max
- best to print out the values and see if there is a way to wirte the values to file as the values are too big to print in console
or may be try for a small grid and see (50 to start with )
- Or the data transfer from gpu to cpu


- sigmaxx and sigmayy have the same values some error in the formulas or the  logic have to see.
- save png nothing is displayed after downloading. check freidrich for logic